import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { DefaultTheme } from "vitepress";
import { fileToUrl } from "./refs/pages.ts";

interface Node {
    text: string;
    order: number;
    link?: string;
    items?: Node[];
}

function readPage(file: string): { title: string | null; order: number; hidden: boolean } {
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const h1 = /^#\s+(.+?)\s*(?:\{#[^}]+\})?\s*$/m.exec(content)?.[1] ?? null;
    const title =
        typeof data.sidebarTitle === "string" ? data.sidebarTitle : typeof data.title === "string" ? data.title : h1;
    return {
        title,
        order: typeof data.order === "number" ? data.order : Number.POSITIVE_INFINITY,
        hidden: data.sidebar === false,
    };
}

function humanize(name: string): string {
    const words = name.replace(/[-_]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

const byOrder = (a: Node, b: Node) => a.order - b.order || a.text.localeCompare(b.text);

function scan(dir: string, contentDir: string, defaultLocale: string): Node[] {
    const nodes: Node[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(contentDir, full).split(path.sep).join("/");
        if (entry.isDirectory()) {
            if (entry.name.startsWith(".") || entry.name === "public") continue;
            const index = path.join(full, "index.md");
            const meta = fs.existsSync(index) ? readPage(index) : { title: null, order: Infinity, hidden: false };
            if (meta.hidden) continue;
            const items = scan(full, contentDir, defaultLocale);
            if (items.length === 0 && !fs.existsSync(index)) continue;
            nodes.push({
                text: meta.title ?? humanize(entry.name),
                order: meta.order,
                ...(fs.existsSync(index) ? { link: fileToUrl(`${rel}/index.md`, defaultLocale) } : {}),
                items,
            });
        } else if (entry.name.endsWith(".md") && entry.name !== "index.md" && !entry.name.includes("[")) {
            const meta = readPage(full);
            if (meta.hidden) continue;
            nodes.push({
                text: meta.title ?? humanize(entry.name.replace(/\.md$/, "")),
                order: meta.order,
                link: fileToUrl(rel, defaultLocale),
            });
        }
    }
    return nodes.sort(byOrder);
}

function toSidebar(node: Node, depth: number): DefaultTheme.SidebarItem {
    return {
        text: node.text,
        ...(node.link ? { link: node.link } : {}),
        ...(node.items?.length
            ? { items: node.items.map((n) => toSidebar(n, depth + 1)), collapsed: depth > 0 ? true : false }
            : {}),
    };
}

/**
 * Guide sidebar of one locale, built from `content/<locale>/`: each top-level folder becomes a section,
 * pages are ordered by their `order` frontmatter (then title). `sidebar: false` hides a page or folder.
 */
export function guideSidebar(contentDir: string, locale: string, defaultLocale: string): DefaultTheme.SidebarItem[] {
    const root = path.join(contentDir, locale);
    if (!fs.existsSync(root)) return [];
    return scan(root, contentDir, defaultLocale).map((node) => toSidebar(node, 0));
}
