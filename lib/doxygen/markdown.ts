import type { DocNodes } from "./model.ts";
import { child, childrenNamed, cleanText, isElement, textOf, type XmlElement, type XmlNode } from "./xml.ts";

/** Resolves Doxygen refids to site paths (without base), e.g. `/api/cpp/class/atmo-engine#run`. */
export interface RenderContext {
    resolve(refid: string): string | null;
    /** VitePress base, needed for links emitted as raw HTML (Markdown links get it from VitePress). */
    base: string;
}

// ---------------------------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------------------------

/** Escapes text for raw HTML in a VitePress page. Braces are encoded so Vue never sees `{{`. */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;");
}

/** Escapes text so markdown-it, VitePress and Vue render it literally. */
export function escapeMarkdown(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/[\\`*_[\]~|#]/g, "\\$&")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;");
}

/** Prevents a paragraph's first characters from being read as a list, heading or quote marker. */
function escapeLineStart(line: string): string {
    return line.replace(/^(\s*)([-+=>]|\d+[.)])(?=\s|$)/, (_, space: string, marker: string) =>
        marker.length > 1 ? `${space}${marker.slice(0, -1)}\\${marker.slice(-1)}` : `${space}\\${marker}`,
    );
}

export function inlineCode(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "";
    const longest = Math.max(0, ...(trimmed.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(longest + 1);
    const pad = trimmed.startsWith("`") || trimmed.endsWith("`") ? " " : "";
    return `${fence}${pad}${trimmed}${pad}${fence}`;
}

function fenced(code: string, lang: string): string {
    const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(longest + 1);
    return `${fence}${lang}\n${code.replace(/\n+$/, "")}\n${fence}`;
}

export function joinBase(base: string, url: string): string {
    return `${base.replace(/\/$/, "")}${url}`;
}

// ---------------------------------------------------------------------------------------------
// Plain text and HTML (types, signatures, previews)
// ---------------------------------------------------------------------------------------------

/** Plain text of a description, whitespace collapsed (for previews, meta descriptions, search). */
export function plainText(nodes: DocNodes): string {
    return nodes
        .map((node) => (isElement(node) && node.name === "para" ? `${textOf(node)} ` : textOf(node)))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
}

/** Doxygen spaces template brackets (`std::vector< T >`); print them the way C++ is written. */
export function tidyCpp(text: string): string {
    return text.replace(/<\s+/g, "<").replace(/\s+>/g, ">").replace(/\s+,/g, ",").replace(/\s+/g, " ");
}

/** Renders a type or code fragment as HTML, turning `<ref>`s into links. */
export function typeHtml(nodes: DocNodes, ctx: RenderContext): string {
    const render = (node: XmlNode): string => {
        if (typeof node === "string") return escapeHtml(tidyCpp(node));
        if (node.name === "sp") return " ";
        if (node.name === "ref") {
            const url = node.attrs.refid ? ctx.resolve(node.attrs.refid) : null;
            const label = escapeHtml(tidyCpp(textOf(node)));
            return url ? `<a href="${escapeHtml(joinBase(ctx.base, url))}">${label}</a>` : label;
        }
        return node.children.map(render).join("");
    };
    return nodes
        .map(render)
        .join("")
        .replace(/\s{2,}/g, " ")
        .replace(/&lt;\s+/g, "&lt;")
        .replace(/\s+&gt;/g, "&gt;")
        .trim();
}

// ---------------------------------------------------------------------------------------------
// Structured sections pulled out of detailed descriptions
// ---------------------------------------------------------------------------------------------

export interface ParamDoc {
    names: string[];
    direction: string | null;
    description: DocNodes;
}

export interface ExtractedDocs {
    /** Description with the sections below removed. */
    body: DocNodes;
    params: ParamDoc[];
    templateParams: ParamDoc[];
    returns: DocNodes[];
    returnValues: ParamDoc[];
    exceptions: ParamDoc[];
    see: DocNodes[];
}

function paramItems(list: XmlElement): ParamDoc[] {
    return childrenNamed(list, "parameteritem").map((item) => {
        const nameList = child(item, "parameternamelist");
        const names = childrenNamed(nameList, "parametername");
        return {
            names: names.map((name) => cleanText(name)).filter(Boolean),
            direction: names[0]?.attrs.direction ?? null,
            description: child(item, "parameterdescription")?.children ?? [],
        };
    });
}

/** Pulls `\param`, `\tparam`, `\return`, `\retval`, `\throws` and `\see` out of a description. */
export function extractDocs(details: DocNodes): ExtractedDocs {
    const out: ExtractedDocs = {
        body: [],
        params: [],
        templateParams: [],
        returns: [],
        returnValues: [],
        exceptions: [],
        see: [],
    };
    const strip = (node: XmlNode): XmlNode | null => {
        if (typeof node === "string") return node;
        if (node.name === "parameterlist") {
            const items = paramItems(node);
            if (node.attrs.kind === "templateparam") out.templateParams.push(...items);
            else if (node.attrs.kind === "retval") out.returnValues.push(...items);
            else if (node.attrs.kind === "exception") out.exceptions.push(...items);
            else out.params.push(...items);
            return null;
        }
        if (node.name === "simplesect" && (node.attrs.kind === "return" || node.attrs.kind === "see")) {
            (node.attrs.kind === "return" ? out.returns : out.see).push(node.children);
            return null;
        }
        return { ...node, children: node.children.map(strip).filter((n): n is XmlNode => n !== null) };
    };
    out.body = details.map(strip).filter((n): n is XmlNode => n !== null);
    return out;
}

// ---------------------------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------------------------

const BLOCK_ELEMENTS = new Set([
    "para",
    "itemizedlist",
    "orderedlist",
    "programlisting",
    "verbatim",
    "preformatted",
    "simplesect",
    "xrefsect",
    "parameterlist",
    "variablelist",
    "table",
    "blockquote",
    "heading",
    "hruler",
    "details",
    "sect1",
    "sect2",
    "sect3",
    "sect4",
    "sect5",
    "sect6",
    "internal",
    "image",
    "dot",
    "dotfile",
    "msc",
    "mscfile",
    "plantuml",
    "diafile",
]);

const SYMBOLS: Record<string, string> = {
    ndash: "–",
    mdash: "—",
    nonbreakablespace: "&nbsp;",
    copy: "©",
    trademark: "™",
    registered: "®",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    laquo: "«",
    raquo: "»",
    hellip: "…",
    times: "×",
    deg: "°",
    plusmn: "±",
    larr: "←",
    rarr: "→",
    uarr: "↑",
    darr: "↓",
    harr: "↔",
    le: "≤",
    ge: "≥",
    ne: "≠",
};

const CONTAINERS: Record<string, { type: string; title: string }> = {
    note: { type: "info", title: "Note" },
    remark: { type: "info", title: "Remark" },
    attention: { type: "warning", title: "Attention" },
    warning: { type: "warning", title: "Warning" },
    important: { type: "warning", title: "Important" },
    pre: { type: "info", title: "Precondition" },
    post: { type: "info", title: "Postcondition" },
    invariant: { type: "info", title: "Invariant" },
    since: { type: "tip", title: "Since" },
    todo: { type: "info", title: "To do" },
};

const LANGUAGES: Record<string, string> = {
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".h": "cpp",
    ".c": "c",
    ".lua": "lua",
    ".luau": "luau",
    ".json": "json",
    ".sh": "sh",
    ".py": "python",
};

export function renderInline(nodes: DocNodes, ctx: RenderContext): string {
    return nodes.map((node) => inline(node, ctx)).join("");
}

function inline(node: XmlNode, ctx: RenderContext): string {
    if (typeof node === "string") return escapeMarkdown(node.replace(/\s+/g, " "));
    const content = () => renderInline(node.children, ctx);
    switch (node.name) {
        case "sp":
            return " ";
        case "ref": {
            const url = node.attrs.refid ? ctx.resolve(node.attrs.refid) : null;
            return url ? `[${content()}](${url})` : content();
        }
        case "computeroutput": {
            const only = node.children.filter((n) => typeof n !== "string" || n.trim() !== "");
            const ref = only.length === 1 && isElement(only[0]) && only[0].name === "ref" ? only[0] : null;
            const url = ref?.attrs.refid ? ctx.resolve(ref.attrs.refid) : null;
            const code = inlineCode(textOf(node).replace(/\s+/g, " "));
            return url ? `[${code}](${url})` : code;
        }
        case "bold":
            return wrapEmphasis("**", content());
        case "emphasis":
            return wrapEmphasis("*", content());
        case "strike":
        case "del":
        case "s":
            return wrapEmphasis("~~", content());
        case "ulink":
            return `[${content() || escapeMarkdown(node.attrs.url ?? "")}](<${node.attrs.url ?? ""}>)`;
        case "linebreak":
            return "<br>";
        case "subscript":
            return `<sub>${content()}</sub>`;
        case "superscript":
            return `<sup>${content()}</sup>`;
        case "anchor":
            return node.attrs.id ? `<a id="${escapeHtml(node.attrs.id)}"></a>` : "";
        case "emoji":
            return node.attrs.unicode ? decodeEntityLike(node.attrs.unicode) : `:${node.attrs.name ?? ""}:`;
        case "formula":
            return inlineCode(textOf(node));
        case "htmlonly":
        case "latexonly":
        case "manonly":
        case "rtfonly":
        case "xmlonly":
        case "docbookonly":
        case "image":
            return "";
        default:
            if (node.name in SYMBOLS) return SYMBOLS[node.name] ?? "";
            return content();
    }
}

function decodeEntityLike(value: string): string {
    return value.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function wrapEmphasis(marker: string, text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return text;
    const lead = text.match(/^\s*/)?.[0] ?? "";
    const trail = text.match(/\s*$/)?.[0] ?? "";
    return `${lead}${marker}${trimmed}${marker}${trail}`;
}

function indent(text: string, by: string, firstLine = by): string {
    return text
        .split("\n")
        .map((line, i) => (i === 0 ? firstLine : line ? by : "") + line)
        .join("\n");
}

function paragraph(text: string): string | null {
    const line = text.replace(/\s+/g, " ").trim();
    return line ? escapeLineStart(line) : null;
}

/** Renders a description to Markdown blocks separated by blank lines. */
export function renderBlocks(nodes: DocNodes, ctx: RenderContext): string {
    const blocks: string[] = [];
    let pending: XmlNode[] = [];
    const flush = () => {
        const text = paragraph(renderInline(pending, ctx));
        if (text) blocks.push(text);
        pending = [];
    };
    for (const node of nodes) {
        if (isElement(node) && BLOCK_ELEMENTS.has(node.name)) {
            flush();
            const block = renderBlock(node, ctx);
            if (block) blocks.push(block);
        } else {
            pending.push(node);
        }
    }
    flush();
    return blocks.join("\n\n");
}

function codeText(element: XmlElement): string {
    const lines = childrenNamed(element, "codeline");
    if (lines.length === 0) return textOf(element);
    return lines.map((line) => textOf(line)).join("\n");
}

function containerFor(type: string, title: string, body: string): string {
    return body ? `::: ${type} ${title}\n${body}\n:::` : "";
}

function renderBlock(node: XmlElement, ctx: RenderContext): string {
    switch (node.name) {
        case "para":
            return renderBlocks(node.children, ctx);
        case "itemizedlist":
        case "orderedlist":
            return childrenNamed(node, "listitem")
                .map((item, i) => {
                    const marker = node.name === "orderedlist" ? `${i + 1}. ` : "- ";
                    const body = renderBlocks(item.children, ctx) || " ";
                    return indent(body, " ".repeat(marker.length), marker);
                })
                .join("\n");
        case "programlisting": {
            const ext = (node.attrs.filename ?? "").toLowerCase();
            return fenced(codeText(node), LANGUAGES[ext] ?? "cpp");
        }
        case "verbatim":
        case "preformatted":
            return fenced(textOf(node), "text");
        case "simplesect": {
            const kind = node.attrs.kind ?? "";
            const container = CONTAINERS[kind];
            const body = renderBlocks(
                node.children.filter((n) => !(isElement(n) && n.name === "title")),
                ctx,
            );
            if (container) return containerFor(container.type, container.title, body);
            if (kind === "par") {
                const title = renderInline(child(node, "title")?.children ?? [], ctx).trim();
                return [title ? `**${title}**` : "", body].filter(Boolean).join("\n\n");
            }
            const label = kind.charAt(0).toUpperCase() + kind.slice(1);
            return body ? `**${label}:** ${body}` : "";
        }
        case "xrefsect": {
            const title = cleanText(child(node, "xreftitle"));
            const body = renderBlocks(child(node, "xrefdescription")?.children ?? [], ctx);
            const type = /deprecated/i.test(title) ? "danger" : /bug/i.test(title) ? "warning" : "info";
            return containerFor(type, escapeMarkdown(title || "Note"), body);
        }
        case "parameterlist":
            return renderParamList(paramItems(node), ctx);
        case "variablelist": {
            const lines: string[] = [];
            const entries = node.children.filter(isElement);
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry?.name !== "varlistentry") continue;
                const term = renderInline(child(entry, "term")?.children ?? [], ctx).trim();
                const item = entries[i + 1]?.name === "listitem" ? entries[i + 1] : undefined;
                const body = item ? renderBlocks(item.children, ctx) : "";
                lines.push(indent(`**${term}**${body ? ` — ${body}` : ""}`, "  ", "- "));
            }
            return lines.join("\n");
        }
        case "table":
            return renderTable(node, ctx);
        case "blockquote":
            return renderBlocks(node.children, ctx)
                .split("\n")
                .map((line) => (line ? `> ${line}` : ">"))
                .join("\n");
        case "heading":
            // Rendered as bold text, not a heading: generated pages pre-claim every heading id.
            return `**${renderInline(node.children, ctx).trim()}**`;
        case "hruler":
            return "***";
        case "details": {
            const summary = cleanText(child(node, "summary")) || "Details";
            const body = renderBlocks(
                node.children.filter((n) => !(isElement(n) && n.name === "summary")),
                ctx,
            );
            return containerFor("details", escapeMarkdown(summary), body);
        }
        case "sect1":
        case "sect2":
        case "sect3":
        case "sect4":
        case "sect5":
        case "sect6": {
            const title = renderInline(child(node, "title")?.children ?? [], ctx).trim();
            const body = renderBlocks(
                node.children.filter((n) => !(isElement(n) && n.name === "title")),
                ctx,
            );
            return [title ? `**${title}**` : "", body].filter(Boolean).join("\n\n");
        }
        default:
            return "";
    }
}

export function renderParamList(items: ParamDoc[], ctx: RenderContext): string {
    return items
        .map((item) => {
            const names = item.names.map((name) => inlineCode(name)).join(", ");
            const direction = item.direction ? ` *(${item.direction})*` : "";
            const body = renderBlocks(item.description, ctx);
            return indent(`${names}${direction}${body ? ` — ${body}` : ""}`, "  ", "- ");
        })
        .join("\n");
}

function renderTable(node: XmlElement, ctx: RenderContext): string {
    const rows = childrenNamed(node, "row").map((row) =>
        childrenNamed(row, "entry").map((entry) =>
            entry.children
                .filter(isElement)
                .map((para) => renderInline(para.name === "para" ? para.children : [para], ctx).trim())
                .filter(Boolean)
                .join("<br>"),
        ),
    );
    const [head, ...body] = rows;
    if (!head) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
    return [line(head), line(Array.from({ length: width }, () => "---")), ...body.map(line)].join("\n");
}
