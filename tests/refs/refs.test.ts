import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPageIndex, extractHeadings, fileToUrl, slugify, type PageIndex } from "../../lib/refs/pages.ts";
import { refsPlugin, type RefProblem } from "../../lib/refs/plugin.ts";
import { parseRef, RefResolver } from "../../lib/refs/resolve.ts";
import { fixtureIndex } from "../helpers.ts";

let contentDir: string;
let pages: PageIndex;

function write(file: string, source: string) {
    const full = path.join(contentDir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
}

beforeAll(() => {
    contentDir = fs.mkdtempSync(path.join(os.tmpdir(), "atmo-refs-"));
    write(
        "en/guide/install.md",
        "---\nid: install\ndescription: How to install.\n---\n\n# Installing ATMO\n\n## Clone and build {#build}\n\n## The `xmake` tool\n\n## Notes\n\n## Notes\n",
    );
    write("en/guide/index.md", "---\nid: guide\ntitle: The guide\n---\n\n# Ignored for title\n");
    write("en/no-id.md", "# No id\n");
    write("en/zz-duplicate.md", "---\nid: install\n---\n# Duplicate\n");
    write("en/bad.md", "---\nid: Bad_Id\n---\n# Bad\n");
    write("fr/guide/install.md", "---\nid: install\n---\n\n# Installer ATMO\n");
    write("api/luau/index.md", "---\nid: luau-api\n---\n\n# Luau\n");
    write("en/api/[slug].md", "---\nid: template\n---\n");
    pages = buildPageIndex(contentDir, { locales: ["en", "fr"] });
});

afterAll(() => fs.rmSync(contentDir, { recursive: true, force: true }));

describe("page index", () => {
    it("slugs headings like VitePress", () => {
        expect(slugify("Clone & build!")).toBe("clone-build");
        expect(slugify("1. Intro")).toBe("_1-intro");
        expect(slugify("Ünïcödé")).toBe("unicode");
    });

    it("extracts headings with custom ids, inline code and duplicate suffixes", () => {
        const { title, headings } = extractHeadings(
            "# Title\n\n## Clone and build {#build}\n\n## The `xmake` tool\n\n## Notes\n\n## Notes\n\n```md\n## Not a heading\n```\n",
        );
        expect(title).toBe("Title");
        expect([...headings.keys()]).toEqual(["title", "build", "the-xmake-tool", "notes", "notes-1"]);
        expect(headings.get("build")).toBe("Clone and build");
    });

    it("maps files to URLs, serving the default locale at the root", () => {
        expect(fileToUrl("en/guide/install.md", "en")).toBe("/guide/install");
        expect(fileToUrl("en/guide/index.md", "en")).toBe("/guide/");
        expect(fileToUrl("en/index.md", "en")).toBe("/");
        expect(fileToUrl("fr/guide/install.md", "en")).toBe("/fr/guide/install");
        expect(fileToUrl("api/luau/index.md", "en")).toBe("/api/luau/");
    });

    it("indexes pages by locale and id, skipping route templates and pages without id", () => {
        expect([...pages.byKey.keys()].sort()).toEqual([":luau-api", "en:guide", "en:install", "fr:install"]);
        expect(pages.byKey.get("en:guide")?.title).toBe("The guide");
        expect(pages.byKey.get("en:install")).toMatchObject({ title: "Installing ATMO", url: "/guide/install" });
    });

    it("reports duplicate and malformed ids", () => {
        expect(pages.errors).toEqual([
            'en/bad.md: invalid page id "Bad_Id" (use lowercase words joined by "-", optionally "/")',
            'en/zz-duplicate.md: page id "install" is already used by en/guide/install.md',
        ]);
    });
});

describe("parseRef", () => {
    it("splits prefix, target, anchor and label", () => {
        expect(parseRef("install")).toEqual({ prefix: null, target: "install", anchor: null, label: null });
        expect(parseRef("page:install#build | Build it")).toEqual({
            prefix: "page",
            target: "install",
            anchor: "build",
            label: "Build it",
        });
        expect(parseRef("cpp:demo::Widget")).toMatchObject({ prefix: "cpp", target: "demo::Widget" });
        expect(parseRef("demo::Widget")).toMatchObject({ prefix: null, target: "demo::Widget" });
    });

    it("rejects empty and unknown prefixes", () => {
        expect(parseRef("  ")).toBeNull();
        expect(parseRef("http:x")).toBeNull();
    });
});

describe("RefResolver", () => {
    const resolver = () => new RefResolver(pages, fixtureIndex(), { defaultLocale: "en" });

    it("resolves pages with their title, description and heading anchors", () => {
        expect(resolver().resolve("install", "en")).toEqual({
            ok: true,
            ref: {
                href: "/guide/install",
                text: "Installing ATMO",
                code: false,
                preview: "How to install.",
                kind: "page",
            },
        });
        expect(resolver().resolve("install#build", "en")).toMatchObject({
            ok: true,
            ref: { href: "/guide/install#build", text: "Clone and build" },
        });
        expect(resolver().resolve("install#build|here", "en")).toMatchObject({ ok: true, ref: { text: "here" } });
    });

    it("prefers the referencing page's locale, then falls back to the default one", () => {
        expect(resolver().resolve("install", "fr")).toMatchObject({ ok: true, ref: { href: "/fr/guide/install" } });
        expect(resolver().resolve("guide", "fr")).toMatchObject({ ok: true, ref: { href: "/guide/" } });
        expect(resolver().resolve("luau-api", "en")).toMatchObject({ ok: true, ref: { href: "/api/luau/" } });
    });

    it("reports unknown pages and anchors", () => {
        expect(resolver().resolve("page:nope", "en")).toEqual({ ok: false, error: 'unknown page id "nope"' });
        expect(resolver().resolve("install#nope", "en")).toMatchObject({
            ok: false,
            error: expect.stringContaining('has no heading "#nope"'),
        });
        expect(resolver().resolve("nope", "en")).toMatchObject({
            ok: false,
            error: expect.stringContaining("unknown"),
        });
    });

    it("resolves C++ symbols by qualified name or unique suffix", () => {
        expect(resolver().resolve("demo::Widget", "en")).toMatchObject({
            ok: true,
            ref: { href: "/api/cpp/class/demo-widget", text: "demo::Widget", code: true, kind: "symbol" },
        });
        expect(resolver().resolve("Widget::size()", "en")).toMatchObject({
            ok: true,
            ref: { href: "/api/cpp/class/demo-widget#size", preview: "Returns the size." },
        });
        expect(resolver().resolve("makeWidget", "en")).toMatchObject({
            ok: true,
            ref: { href: "/api/cpp/namespace/demo#makewidget" },
        });
        expect(resolver().resolve("DEMO_VERSION", "en")).toMatchObject({
            ok: true,
            ref: { href: "/api/cpp/file/src-demo-widget-hpp#demo-version" },
        });
    });

    it("links overloads to the first declaration and prefers types over their constructors", () => {
        expect(resolver().resolve("Widget::resize", "en")).toMatchObject({
            ok: true,
            ref: { href: "/api/cpp/class/demo-widget#resize" },
        });
        // `Widget` also matches the constructor `demo::Widget::Widget`.
        expect(resolver().resolve("Widget", "en")).toMatchObject({
            ok: true,
            ref: { href: "/api/cpp/class/demo-widget" },
        });
    });

    it("explains unknown symbols and anchors on symbols", () => {
        expect(resolver().resolve("cpp:Nope", "en")).toEqual({ ok: false, error: 'unknown C++ symbol "Nope"' });
        expect(resolver().resolve("cpp:Widget#size", "en")).toMatchObject({
            ok: false,
            error: expect.stringContaining('use "::"'),
        });
        expect(resolver().resolve("luau:Entity", "en")).toMatchObject({
            ok: false,
            error: expect.stringContaining("Luau"),
        });
    });

    it("explains that symbols need the API model", () => {
        const withoutApi = new RefResolver(pages, null, { defaultLocale: "en" });
        expect(withoutApi.resolve("cpp:Widget", "en")).toMatchObject({
            ok: false,
            error: expect.stringContaining("pnpm api"),
        });
    });
});

describe("refsPlugin", () => {
    function render(source: string, file = "en/guide/page.md") {
        const problems: RefProblem[] = [];
        const md = new MarkdownIt({ html: true });
        refsPlugin(md, {
            resolver: new RefResolver(pages, fixtureIndex(), { defaultLocale: "en" }),
            locales: ["en", "fr"],
            report: (p) => problems.push(p),
        });
        return { html: md.render(source, { relativePath: file }).trim(), problems };
    }

    it("renders page and symbol references as links with previews", () => {
        expect(render("See [[install]].").html).toBe(
            '<p>See <a href="/guide/install" class="atmo-ref atmo-ref--page" data-preview="How to install.">Installing ATMO</a>.</p>',
        );
        expect(render("Use [[Widget::size()]].").html).toBe(
            '<p>Use <a href="/api/cpp/class/demo-widget#size" class="atmo-ref atmo-ref--symbol" data-preview="Returns the size."><code>Widget::size()</code></a>.</p>',
        );
    });

    it("uses the locale of the referencing file", () => {
        expect(render("[[install]]", "fr/a.md").html).toContain('href="/fr/guide/install"');
    });

    it("leaves code, escaped brackets and ordinary links alone", () => {
        expect(render("`[[install]]` and \\[[install]] and [x](/y)").html).toBe(
            '<p><code>[[install]]</code> and [[install]] and <a href="/y">x</a></p>',
        );
        expect(render("```\n[[install]]\n```").html).toBe("<pre><code>[[install]]\n</code></pre>");
    });

    it("works inside tables and emphasis", () => {
        expect(render("| a |\n| - |\n| [[Widget]] |").html).toContain('<td><a href="/api/cpp/class/demo-widget"');
        expect(render("**[[install|bold link]]**").html).toContain('<strong><a href="/guide/install"');
    });

    it("renders broken references visibly, reports them and escapes their text", () => {
        const { html, problems } = render("Oops [[nope|{{ label }}]].");
        expect(html).toBe(
            '<p>Oops <span class="atmo-ref atmo-ref--broken" title="unknown page id or symbol &quot;nope&quot;">&#123;&#123; label &#125;&#125;</span>.</p>',
        );
        expect(problems).toEqual([
            { file: "en/guide/page.md", ref: "[[nope|{{ label }}]]", message: 'unknown page id or symbol "nope"' },
        ]);
    });

    it("points same-page anchors at regular links", () => {
        expect(render("[[#top]]").problems[0]?.message).toContain("[text](#anchor)");
    });
});
