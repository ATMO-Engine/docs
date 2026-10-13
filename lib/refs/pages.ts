import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

/**
 * Heading slugger. Passed to VitePress as `markdown.anchor.slugify` as well, so the anchors we validate
 * are exactly the anchors VitePress renders. Same algorithm as VitePress' default.
 */
export function slugify(text: string): string {
    return text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[\u0000-\u001f]/g, "")
        .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/^(\d)/, "_$1")
        .toLowerCase();
}

/** Page ids: lowercase words separated by `-`, optionally namespaced with `/` (`manual/scenes`). */
export const PAGE_ID_RE = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

export interface PageEntry {
    id: string;
    /** Source path relative to the content root, e.g. `en/manual/scenes.md`. */
    file: string;
    /** Locale folder (`en`, `fr`...) or `""` for locale-independent pages (e.g. `api/`). */
    locale: string;
    /** Site path without base, e.g. `/manual/scenes`. */
    url: string;
    title: string;
    description: string;
    /** Heading anchor → heading text. */
    headings: Map<string, string>;
}

export interface PageIndexOptions {
    /** Locale folders under the content root. The first one is served at the site root. */
    locales: string[];
}

const md = new MarkdownIt({ html: true });

function headingText(inline: Token | undefined): { text: string; id: string | null } {
    const children = inline?.children ?? [];
    let text = children
        .filter((t) => t.type === "text" || t.type === "code_inline")
        .map((t) => t.content)
        .join("");
    // markdown-it-attrs syntax used by VitePress for custom anchors: `## Title {#custom-id}`.
    const custom = /\s*\{#([^}\s]+)\}\s*$/.exec(text);
    if (custom) text = text.slice(0, custom.index);
    return { text: text.trim(), id: custom?.[1] ?? null };
}

/** Extracts headings the way VitePress anchors them (duplicates get `-1`, `-2`...). */
export function extractHeadings(source: string): { title: string | null; headings: Map<string, string> } {
    const tokens = md.parse(source, {});
    const headings = new Map<string, string>();
    let title: string | null = null;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i]?.type !== "heading_open") continue;
        const { text, id } = headingText(tokens[i + 1]);
        if (tokens[i]?.tag === "h1" && title === null) title = text;
        let slug = id ?? slugify(text);
        if (!id) for (let n = 1; headings.has(slug); n++) slug = `${slugify(text)}-${n}`;
        headings.set(slug, text);
    }
    return { title, headings };
}

function walk(dir: string, root: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "public" && !entry.name.startsWith(".")) walk(full, root, out);
        } else if (entry.name.endsWith(".md") && !entry.name.includes("[")) {
            out.push(path.relative(root, full).split(path.sep).join("/"));
        }
    }
    return out;
}

/** Site path of a content file: `en/manual/index.md` → `/manual/`, `fr/a.md` → `/fr/a`. */
export function fileToUrl(file: string, defaultLocale: string): string {
    const withoutLocale = file.startsWith(`${defaultLocale}/`) ? file.slice(defaultLocale.length + 1) : file;
    const url = `/${withoutLocale.replace(/\.md$/, "")}`;
    return url.endsWith("/index") ? url.slice(0, -"index".length) : url === "/index" ? "/" : url;
}

export interface PageIndex {
    pages: PageEntry[];
    /** `locale:id` → page. */
    byKey: Map<string, PageEntry>;
    /** Problems found while indexing (duplicate or malformed ids). */
    errors: string[];
}

export function buildPageIndex(contentDir: string, options: PageIndexOptions): PageIndex {
    const defaultLocale = options.locales[0] ?? "en";
    const index: PageIndex = { pages: [], byKey: new Map(), errors: [] };
    for (const file of walk(contentDir, contentDir, []).sort()) {
        const source = fs.readFileSync(path.join(contentDir, file), "utf8");
        const { data, content } = matter(source);
        if (data.id === undefined) continue;
        const id = String(data.id);
        if (!PAGE_ID_RE.test(id)) {
            index.errors.push(`${file}: invalid page id "${id}" (use lowercase words joined by "-", optionally "/")`);
            continue;
        }
        const firstSegment = file.split("/")[0] ?? "";
        const locale = options.locales.includes(firstSegment) ? firstSegment : "";
        const { title, headings } = extractHeadings(content);
        const entry: PageEntry = {
            id,
            file,
            locale,
            url: fileToUrl(file, defaultLocale),
            title: typeof data.title === "string" ? data.title : (title ?? id),
            description: typeof data.description === "string" ? data.description : "",
            headings,
        };
        const key = `${locale}:${id}`;
        const existing = index.byKey.get(key);
        if (existing) {
            index.errors.push(`${file}: page id "${id}" is already used by ${existing.file}`);
            continue;
        }
        index.byKey.set(key, entry);
        index.pages.push(entry);
    }
    return index;
}
