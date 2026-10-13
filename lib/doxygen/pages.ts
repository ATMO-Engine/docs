import { MEMBER_GROUPS, memberGroup, type MemberGroupId } from "./groups.ts";
import {
    escapeHtml,
    escapeMarkdown,
    extractDocs,
    inlineCode,
    joinBase,
    plainText,
    renderBlocks,
    renderInline,
    renderParamList,
    tidyCpp,
    typeHtml,
    type RenderContext,
} from "./markdown.ts";
import { compoundUrl, type ApiCompound, type ApiMember, type ApiModel, type ApiParam, type DocNodes } from "./model.ts";
import { textOf } from "./xml.ts";

/** Everything addressable in the model, keyed by Doxygen refid. */
export class ApiIndex {
    readonly compounds = new Map<string, ApiCompound>();
    readonly members = new Map<string, { member: ApiMember; owner: ApiCompound }>();
    private readonly urls = new Map<string, string>();

    constructor(readonly model: ApiModel) {
        for (const compound of model.compounds) {
            this.compounds.set(compound.id, compound);
            const url = compoundUrl(compound);
            this.urls.set(compound.id, url);
            for (const member of compound.sections.flatMap((s) => s.members)) {
                this.members.set(member.id, { member, owner: compound });
                this.urls.set(member.id, `${url}#${member.anchor}`);
                for (const value of member.enumValues) this.urls.set(value.id, `${url}#${member.anchor}`);
            }
        }
    }

    url(refid: string): string | null {
        return this.urls.get(refid) ?? null;
    }

    context(base: string): RenderContext {
        return { base, resolve: (refid) => this.url(refid) };
    }

    children(compound: ApiCompound): { namespaces: ApiCompound[]; classes: ApiCompound[]; concepts: ApiCompound[] } {
        const pick = (ids: string[]) =>
            ids.map((id) => this.compounds.get(id)).filter((c): c is ApiCompound => c !== undefined);
        return {
            namespaces: pick(compound.innerNamespaces),
            classes: pick(compound.innerClasses),
            concepts: pick(compound.innerConcepts),
        };
    }
}

export interface ApiPage {
    /** Route folder (`class`, `namespace`, `concept`, `file`). */
    route: string;
    slug: string;
    title: string;
    description: string;
    /** Markdown body. */
    content: string;
    /** Source file of the compound in the engine repository, for "view source" links. */
    source: { file: string; line: number | null } | null;
}

const KIND_LABELS: Record<ApiCompound["kind"], string> = {
    namespace: "namespace",
    class: "class",
    struct: "struct",
    union: "union",
    concept: "concept",
    file: "header",
};

function badge(text: string, type: "info" | "tip" | "warning" | "danger" = "info"): string {
    return `<Badge type="${type}" text="${escapeHtml(text)}" />`;
}

function templateLine(params: ApiParam[] | null, ctx: RenderContext): string {
    if (!params) return "";
    const list = params.map((param) => paramHtml(param, ctx)).join(", ");
    return `<span class="api-kw">template</span>&lt;${list}&gt;\n`;
}

function paramHtml(param: ApiParam, ctx: RenderContext): string {
    const type = typeHtml(param.type, ctx);
    const name = param.name ? `<span class="api-param">${escapeHtml(param.name)}</span>` : "";
    const array = param.array ? escapeHtml(param.array) : "";
    const value = param.defaultValue ? ` = ${typeHtml(param.defaultValue, ctx)}` : "";
    // The engine's clang-format uses `PointerAlignment: Right`: `const std::string &path`.
    const separator = type && name && !/(\*|&amp;)$/.test(type) ? " " : "";
    return `${type}${separator}${name}${array}${value}`;
}

/** Text after the parameter list's closing parenthesis: ` const`, ` override`, `=delete`... */
function trailingQualifiers(argsString: string): string {
    let depth = 0;
    for (let i = 0; i < argsString.length; i++) {
        if (argsString[i] === "(") depth++;
        else if (argsString[i] === ")" && --depth === 0) {
            // Doxygen glues specifiers: `const =default`, `=0` → ` const = default`, ` = 0`.
            const rest = argsString
                .slice(i + 1)
                .replace(/\s*=\s*/g, " = ")
                .trim();
            return rest ? ` ${rest}` : "";
        }
    }
    return "";
}

function keywords(...words: (string | false)[]): string {
    return words
        .filter((w): w is string => Boolean(w))
        .map((w) => `<span class="api-kw">${w}</span> `)
        .join("");
}

function memberSignature(member: ApiMember, ctx: RenderContext): string {
    const name = `<span class="api-name">${escapeHtml(member.name)}</span>`;
    const type = typeHtml(member.type, ctx);
    const template = templateLine(member.templateParams, ctx);
    switch (member.kind) {
        case "function":
        case "friend": {
            const params = member.params.map((p) => paramHtml(p, ctx));
            const oneLine = params.join(", ");
            const list = params.length > 2 || textLength(oneLine) > 60 ? `\n    ${params.join(",\n    ")}\n` : oneLine;
            const prefix = keywords(
                member.kind === "friend" && "friend",
                member.isStatic && "static",
                member.virtuality !== "non-virtual" && "virtual",
                member.isExplicit && "explicit",
                member.isConstexpr && "constexpr",
            );
            const requires = member.requires
                ? `\n    <span class="api-kw">requires</span> ${typeHtml(member.requires, ctx)}`
                : "";
            const tail = escapeHtml(trailingQualifiers(member.argsString));
            return `${template}${prefix}${type ? `${type} ` : ""}${name}(${list})${tail}${requires}`;
        }
        case "typedef": {
            const isUsing = /^\s*using\b/.test(textOf(member.type)) || member.argsString === "";
            return isUsing
                ? `${template}${keywords("using")}${name} = ${type}`
                : `${keywords("typedef")}${type} ${name}${escapeHtml(member.argsString)}`;
        }
        case "enum": {
            const underlying = type ? ` : ${type}` : "";
            return `${keywords("enum", member.isStrongEnum && "class")}${name}${underlying}`;
        }
        case "define": {
            const params =
                member.params.length > 0 ? `(${member.params.map((p) => escapeHtml(p.name ?? "")).join(", ")})` : "";
            const value = member.initializer ? ` ${typeHtml(member.initializer, ctx)}` : "";
            return `<span class="api-kw">#define</span> ${name}${params}${value}`;
        }
        default: {
            const prefix = keywords(member.isStatic && "static", member.isConstexpr && "constexpr");
            const init = member.initializer ? textOf(member.initializer).trim() : "";
            const value = init && init.length <= 80 ? ` ${typeHtml(member.initializer ?? [], ctx)}` : "";
            return `${template}${prefix}${type} ${name}${escapeHtml(member.argsString)}${value}`;
        }
    }
}

function textLength(html: string): number {
    return html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "x").length;
}

function signatureBlock(html: string): string {
    return `<pre class="api-signature"><code>${html}</code></pre>`;
}

function compoundSignature(compound: ApiCompound, index: ApiIndex, ctx: RenderContext): string | null {
    if (compound.kind === "namespace" || compound.kind === "file") return null;
    const template = templateLine(compound.templateParams, ctx);
    if (compound.kind === "concept") {
        const body = compound.conceptInitializer ? typeHtml(compound.conceptInitializer, ctx) : "";
        // Doxygen already includes `template<...> concept Name = ...` in the initializer.
        return body || `${template}${keywords("concept")}<span class="api-name">${escapeHtml(compound.title)}</span>`;
    }
    const bases = compound.bases
        .map((base) => {
            const url = base.id ? index.url(base.id) : null;
            const name = escapeHtml(tidyCpp(base.name));
            const link = url ? `<a href="${escapeHtml(joinBase(ctx.base, url))}">${name}</a>` : name;
            return `${keywords(base.protection, base.virtual && "virtual").trim()} ${link}`;
        })
        .join(", ");
    return `${template}${keywords(compound.kind)}<span class="api-name">${escapeHtml(compound.title)}</span>${compound.isFinal ? ` ${keywords("final").trim()}` : ""}${bases ? ` : ${bases}` : ""}`;
}

function docSections(details: DocNodes, ctx: RenderContext, templateParamsLabel = "Template parameters"): string {
    const docs = extractDocs(details);
    const parts = [renderBlocks(docs.body, ctx)];
    if (docs.templateParams.length)
        parts.push(`**${templateParamsLabel}**\n\n${renderParamList(docs.templateParams, ctx)}`);
    if (docs.params.length) parts.push(`**Parameters**\n\n${renderParamList(docs.params, ctx)}`);
    for (const ret of docs.returns) {
        const body = renderBlocks(ret, ctx);
        if (body) parts.push(`**Returns** ${body}`);
    }
    if (docs.returnValues.length) parts.push(`**Return values**\n\n${renderParamList(docs.returnValues, ctx)}`);
    if (docs.exceptions.length) parts.push(`**Throws**\n\n${renderParamList(docs.exceptions, ctx)}`);
    if (docs.see.length) {
        const see = docs.see.map((nodes) =>
            renderInline(
                nodes.flatMap((n) => (typeof n === "string" ? [n] : n.children)),
                ctx,
            ).trim(),
        );
        parts.push(`**See also** ${see.filter(Boolean).join(", ")}`);
    }
    return parts.filter(Boolean).join("\n\n");
}

function memberBadges(member: ApiMember): string {
    const badges: string[] = [];
    if (member.protection !== "public") badges.push(badge(member.protection, "warning"));
    if (member.virtuality === "pure-virtual") badges.push(badge("pure virtual", "tip"));
    else if (member.virtuality === "virtual") badges.push(badge("virtual", "tip"));
    if (/=\s*delete/.test(member.argsString)) badges.push(badge("deleted", "danger"));
    return badges.length ? ` ${badges.join(" ")}` : "";
}

function memberHeadingText(member: ApiMember): string {
    const name = escapeMarkdown(member.name);
    return member.kind === "function" || (member.kind === "define" && member.params.length) ? `${name}()` : name;
}

function renderMember(member: ApiMember, ctx: RenderContext): string {
    const parts = [
        `### ${memberHeadingText(member)}${memberBadges(member)} {#${member.anchor}}`,
        signatureBlock(memberSignature(member, ctx)),
    ];
    const brief = renderBlocks(member.brief, ctx);
    if (brief) parts.push(brief);
    const details = docSections(member.details, ctx);
    if (details) parts.push(details);
    if (member.enumValues.length) {
        const rows = member.enumValues.map((value) => {
            const init = value.initializer
                ? escapeHtml(
                      textOf(value.initializer)
                          .replace(/^\s*=\s*/, "")
                          .trim(),
                  )
                : "";
            const description = renderInline(
                value.brief.flatMap((n) => (typeof n === "string" ? [n] : n.children)),
                ctx,
            ).trim();
            return `| ${inlineCode(value.name)} | ${init ? `<code>${init}</code>` : ""} | ${description} |`;
        });
        parts.push(["| Value | | Description |", "| --- | --- | --- |", ...rows].join("\n"));
    }
    return parts.join("\n\n");
}

function briefInline(nodes: DocNodes, ctx: RenderContext): string {
    return renderInline(
        nodes.flatMap((n) => (typeof n === "string" ? [n] : n.name === "para" ? n.children : [n])),
        ctx,
    )
        .replace(/\s+/g, " ")
        .trim();
}

function summaryTable(members: ApiMember[], ctx: RenderContext): string {
    const rows = members.map((member) => {
        const type =
            member.kind === "function" || member.kind === "variable" || member.kind === "typedef"
                ? typeHtml(member.type, ctx)
                : "";
        const name = `[${memberHeadingText(member)}](#${member.anchor})`;
        return `| ${type ? `<code>${type.replace(/\|/g, "&#124;")}</code>` : ""} | ${name} | ${briefInline(member.brief, ctx)} |`;
    });
    return ["| | Name | Description |", "| --- | --- | --- |", ...rows].join("\n");
}

function compoundTable(compounds: ApiCompound[], ctx: RenderContext, label: (c: ApiCompound) => string): string {
    const rows = compounds.map(
        (c) => `| [${escapeMarkdown(label(c))}](${compoundUrl(c)}) | ${briefInline(c.brief, ctx)} |`,
    );
    return ["| Name | Description |", "| --- | --- |", ...rows].join("\n");
}

function metaBlock(compound: ApiCompound, index: ApiIndex, ctx: RenderContext, sourceUrl: string | null): string {
    const items: string[] = [];
    const parent = compound.parent ? index.compounds.get(compound.parent) : undefined;
    if (parent) {
        const label = parent.kind === "namespace" ? "Namespace" : "Member of";
        items.push(
            `<span class="api-meta-label">${label}</span> <a href="${escapeHtml(joinBase(ctx.base, compoundUrl(parent)))}"><code>${escapeHtml(parent.name)}</code></a>`,
        );
    }
    if (compound.include)
        items.push(
            `<span class="api-meta-label">Header</span> <code>#include "${escapeHtml(compound.include)}"</code>`,
        );
    if (sourceUrl)
        items.push(
            `<a class="api-meta-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">View source</a>`,
        );
    return items.length
        ? `<div class="api-meta">\n${items.map((item) => `<span class="api-meta-item">${item}</span>`).join("\n")}\n</div>`
        : "";
}

function inheritance(compound: ApiCompound, index: ApiIndex, ctx: RenderContext): string {
    const list = (refs: ApiCompound["bases"]) =>
        refs
            .map((ref) => {
                const url = ref.id ? index.url(ref.id) : null;
                const code = inlineCode(tidyCpp(ref.name));
                return url ? `[${code}](${url})` : code;
            })
            .join(", ");
    const lines: string[] = [];
    if (compound.bases.length) lines.push(`**Inherits** ${list(compound.bases)}`);
    if (compound.derived.length) lines.push(`**Inherited by** ${list(compound.derived)}`);
    return lines.length ? `## Inheritance {#inheritance}\n\n${lines.join("\n\n")}` : "";
}

export interface PageOptions {
    base: string;
    /** Builds a link to the engine source on GitHub, or `null` to omit "view source". */
    sourceUrl(file: string, line: number | null): string | null;
}

export function renderCompoundPage(compound: ApiCompound, index: ApiIndex, options: PageOptions): ApiPage {
    const ctx = index.context(options.base);
    const sourceUrl = compound.location ? options.sourceUrl(compound.location.file, compound.location.line) : null;
    const heading = compound.kind === "namespace" || compound.kind === "file" ? compound.name : compound.title;
    const parts: string[] = [
        `# ${escapeMarkdown(heading)} ${badge(KIND_LABELS[compound.kind], "tip")}${compound.isAbstract ? ` ${badge("abstract")}` : ""} {#overview}`,
    ];

    const meta = metaBlock(compound, index, ctx, sourceUrl);
    if (meta) parts.push(meta);
    const brief = renderBlocks(compound.brief, ctx);
    if (brief) parts.push(brief);
    const signature = compoundSignature(compound, index, ctx);
    if (signature) parts.push(signatureBlock(signature));

    const description = docSections(compound.details, ctx);
    if (description) parts.push(`## Description {#description}\n\n${description}`);
    const inherits = inheritance(compound, index, ctx);
    if (inherits) parts.push(inherits);

    // Nested scopes.
    const { namespaces, classes, concepts } = index.children(compound);
    if (namespaces.length)
        parts.push(`## Namespaces {#namespaces}\n\n${compoundTable(namespaces, ctx, (c) => c.name)}`);
    if (classes.length) parts.push(`## Classes {#classes}\n\n${compoundTable(classes, ctx, (c) => c.title)}`);
    if (concepts.length) parts.push(`## Concepts {#concepts}\n\n${compoundTable(concepts, ctx, (c) => c.title)}`);

    // Members, grouped for reading rather than by Doxygen section.
    const grouped = new Map<MemberGroupId, ApiMember[]>();
    for (const member of compound.sections.flatMap((s) => s.members)) {
        const group = memberGroup(member, compound);
        grouped.set(group, [...(grouped.get(group) ?? []), member]);
    }
    const groups = MEMBER_GROUPS.filter((g) => grouped.has(g.id));
    if (groups.length) {
        const summary = groups.map((g) => `**${g.title}**\n\n${summaryTable(grouped.get(g.id) ?? [], ctx)}`);
        parts.push(`## Summary {#summary}\n\n${summary.join("\n\n")}`);
        for (const group of groups) {
            const members = (grouped.get(group.id) ?? []).map((m) => renderMember(m, ctx));
            parts.push(`## ${group.title} {#${group.id}}\n\n${members.join("\n\n")}`);
        }
    }

    return {
        route: compoundUrl(compound).split("/")[3] ?? compound.kind,
        slug: compound.slug,
        title: heading,
        description: plainText(compound.brief),
        content: `${parts.join("\n\n")}\n`,
        source: compound.location,
    };
}
