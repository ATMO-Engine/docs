import fs from "node:fs";
import path from "node:path";
import { createMarkdownRenderer, type MarkdownRenderer } from "vitepress";
import { beforeAll, describe, expect, it } from "vitest";
import { ROOT_DIR } from "../../lib/config.ts";
import { loadApiIndex } from "../../lib/doxygen/load.ts";
import { renderCompoundPage, type ApiIndex } from "../../lib/doxygen/pages.ts";
import { apiSidebar } from "../../lib/doxygen/sidebar.ts";
import { slugify } from "../../lib/refs/pages.ts";
import { fixtureIndex } from "../helpers.ts";

const options = {
    base: "/latest/",
    sourceUrl: (file: string, line: number | null) => `https://example.com/${file}#L${line}`,
};

function page(index: ApiIndex, name: string) {
    const compound = [...index.compounds.values()].find((c) => c.name === name);
    if (!compound) throw new Error(`no compound ${name}`);
    return renderCompoundPage(compound, index, options);
}

let md: MarkdownRenderer;
beforeAll(async () => {
    // The renderer VitePress itself uses, with the same anchor slugger as the site config.
    md = await createMarkdownRenderer(path.join(ROOT_DIR, "content"), { anchor: { slugify } }, "/latest/");
});

function renderHtml(content: string): string {
    return md.render(content, { cleanUrls: true, relativePath: "api/cpp/class/test.md" });
}

function headingIds(html: string): string[] {
    return [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("renderCompoundPage", () => {
    const index = fixtureIndex();
    const widget = page(index, "demo::Widget");

    it("describes the page for routing and metadata", () => {
        expect(widget.route).toBe("class");
        expect(widget.slug).toBe("demo-widget");
        expect(widget.title).toBe("Widget");
        expect(widget.description).toBe("A demo widget <T> with * stars.");
    });

    it("renders the header, meta block and class signature", () => {
        expect(widget.content).toMatch(/^# Widget <Badge type="tip" text="class" \/> \{#overview\}/);
        expect(widget.content).toContain('<a href="/latest/api/cpp/namespace/demo"><code>demo</code></a>');
        expect(widget.content).toContain('<code>#include "demo/widget.hpp"</code>');
        expect(widget.content).toContain("https://example.com/src/demo/widget.hpp#L12");
        expect(widget.content).toContain(
            '<span class="api-kw">class</span> <span class="api-name">Widget</span> <span class="api-kw">final</span> : <span class="api-kw">public</span> Base&lt;int&gt;',
        );
    });

    it("groups members and renders signatures in the engine's style", () => {
        const order = ["## Summary", "## Constructors", "## Functions", "## Static functions", "## Operators"];
        const positions = order.map((heading) => widget.content.indexOf(heading));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);

        expect(widget.content).toContain(
            '<span class="api-kw">explicit</span> <span class="api-name">Widget</span>(int <span class="api-param">size</span> = 0)',
        );
        expect(widget.content).toContain(
            'const std::string &amp; <span class="api-name">size</span>(const std::string &amp;<span class="api-param">unit</span>) const noexcept',
        );
        expect(widget.content).toContain(
            '<span class="api-kw">template</span>&lt;typename T&gt;\n<span class="api-kw">static</span> std::shared_ptr&lt;T&gt; <span class="api-name">create</span>()',
        );
        expect(widget.content).toContain(
            '<span class="api-name">operator==</span>(const <a href="/latest/api/cpp/class/demo-widget">Widget</a> &amp;<span class="api-param">other</span>) const = default',
        );
        expect(widget.content).toMatch(
            /### onResize\(\) <Badge type="warning" text="protected" \/> <Badge type="tip" text="pure virtual" \/> \{#onresize\}/,
        );
    });

    it("renders structured member documentation", () => {
        expect(widget.content).toContain("**Parameters**\n\n- `unit` *(in)* — The unit.");
        expect(widget.content).toContain("**Returns** The size, as text.");
        expect(widget.content).toContain("**See also** [demo::makeWidget](/api/cpp/namespace/demo#makewidget)");
        expect(widget.content).toContain('```cpp\nauto w = demo::makeWidget(2);\nw.size("px");\n```');
        expect(widget.content).toContain("::: info Note\nNever &#123;&#123; interpolated &#125;&#125;.\n:::");
    });

    it("renders namespace pages with nested scopes and enums", () => {
        const ns = page(index, "demo");
        expect(ns.content).toContain("## Classes {#classes}");
        expect(ns.content).toContain(
            "| [Widget](/api/cpp/class/demo-widget) | A *demo* widget &lt;T&gt; with \\* stars. |",
        );
        expect(ns.content).toContain(
            '<span class="api-kw">enum</span> <span class="api-kw">class</span> <span class="api-name">Color</span> : std::uint8_t',
        );
        expect(ns.content).toContain("| `Red` | <code>1</code> | The red one. |");
        expect(ns.content).toContain("### description() {#description-2}");
    });

    it("produces Markdown VitePress renders with unique ids, base-prefixed links and no Vue interpolation", () => {
        for (const name of ["demo::Widget", "demo", "src/demo/widget.hpp"]) {
            const html = renderHtml(page(index, name).content);
            const ids = headingIds(html);
            expect(new Set(ids).size).toBe(ids.length);
            expect(html).not.toMatch(/\{\{/);
        }
        const html = renderHtml(widget.content);
        expect(html).toContain('<a href="/latest/api/cpp/namespace/demo#makewidget">demo::makeWidget</a>');
        expect(headingIds(html)).toEqual(
            expect.arrayContaining(["overview", "summary", "resize", "resize-2", "destructor"]),
        );
    });
});

describe("apiSidebar", () => {
    it("nests classes under namespaces and groups headers by directory", () => {
        const sidebar = apiSidebar(fixtureIndex());
        expect(sidebar.map((s) => s.text)).toEqual(["C++ API", "Namespaces", "Headers"]);
        const demo = sidebar[1]?.items?.[0];
        expect(demo).toMatchObject({ text: "demo", link: "/api/cpp/namespace/demo" });
        expect(demo?.items?.map((i) => i.text)).toEqual(["Widget"]);
        expect(sidebar[2]?.items?.[0]).toMatchObject({
            text: "src/demo",
            items: [{ text: "widget.hpp", link: "/api/cpp/file/src-demo-widget-hpp" }],
        });
    });
});

// Regression net over the real engine: every generated page must survive VitePress' renderer.
const realModel = path.join(ROOT_DIR, ".cache", "api", "cpp.json");
describe.runIf(fs.existsSync(realModel))("engine API model (from `pnpm api`)", () => {
    it("renders every page with unique heading ids and escaped interpolation", () => {
        const index = loadApiIndex(realModel);
        expect(index).not.toBeNull();
        const failures: string[] = [];
        for (const compound of index?.compounds.values() ?? []) {
            const html = renderHtml(renderCompoundPage(compound, index as ApiIndex, options).content);
            const ids = headingIds(html);
            if (new Set(ids).size !== ids.length) failures.push(`${compound.name}: duplicate heading id`);
            if (/\{\{/.test(html)) failures.push(`${compound.name}: raw {{ in output`);
        }
        expect(failures).toEqual([]);
    });
});
