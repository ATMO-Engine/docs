import { plainText } from "../doxygen/markdown.ts";
import { compoundUrl } from "../doxygen/model.ts";
import type { ApiIndex } from "../doxygen/pages.ts";
import { normalizeName, splitQualified } from "../doxygen/parse.ts";
import { PAGE_ID_RE, type PageEntry, type PageIndex } from "./pages.ts";

/** Reference namespaces. `luau:` is reserved for the future Luau API reference. */
export const REF_PREFIXES = ["page", "cpp", "luau"] as const;
export type RefPrefix = (typeof REF_PREFIXES)[number];

export interface ParsedRef {
    prefix: RefPrefix | null;
    /** Target without prefix, anchor or label. */
    target: string;
    anchor: string | null;
    label: string | null;
}

/** Parses the inside of `[[...]]`: `[prefix:]target[#anchor][|label]`. */
export function parseRef(raw: string): ParsedRef | null {
    const pipe = raw.indexOf("|");
    const spec = (pipe >= 0 ? raw.slice(0, pipe) : raw).trim();
    const label = pipe >= 0 ? raw.slice(pipe + 1).trim() || null : null;
    if (!spec) return null;

    let prefix: RefPrefix | null = null;
    let rest = spec;
    const colon = /^([a-z]+):(?!:)/.exec(spec);
    if (colon) {
        if (!(REF_PREFIXES as readonly string[]).includes(colon[1] ?? "")) return null;
        prefix = colon[1] as RefPrefix;
        rest = spec.slice(colon[0].length);
    }
    const hash = rest.indexOf("#");
    const target = (hash >= 0 ? rest.slice(0, hash) : rest).trim();
    const anchor = hash >= 0 ? rest.slice(hash + 1).trim() || null : null;
    if (!target && !anchor) return null;
    return { prefix, target, anchor, label };
}

export interface ResolvedRef {
    href: string;
    text: string;
    /** Render the text as inline code (symbols). */
    code: boolean;
    /** Plain-text summary for hover previews. */
    preview: string;
    kind: "page" | "symbol";
}

export type Resolution = { ok: true; ref: ResolvedRef } | { ok: false; error: string };

const COMPOUND_KINDS = new Set(["namespace", "class", "struct", "union", "concept", "file"]);

interface SymbolEntry {
    name: string;
    href: string;
    preview: string;
    kind: string;
}

/** Strips call parentheses and spacing so `Entity::serialize()` finds `atmo::...::Entity::serialize`. */
export function normalizeSymbolQuery(query: string): string {
    return normalizeName(query.replace(/\(\s*\)\s*$/, ""));
}

export class SymbolTable {
    private readonly byName = new Map<string, SymbolEntry>();
    /** Last name component → entries, for suffix matching. */
    private readonly byLastPart = new Map<string, SymbolEntry[]>();

    constructor(api: ApiIndex | null) {
        if (!api) return;
        for (const compound of api.compounds.values()) {
            this.add({
                name: compound.name,
                href: compoundUrl(compound),
                preview: plainText(compound.brief),
                kind: compound.kind,
            });
            for (const member of compound.sections.flatMap((s) => s.members)) {
                // Overloads share a name: the first one (declaration order) is the link target.
                this.add({
                    name: member.qualifiedName,
                    href: `${compoundUrl(compound)}#${member.anchor}`,
                    preview: plainText(member.brief),
                    kind: member.kind,
                });
            }
        }
    }

    private add(entry: SymbolEntry): void {
        if (this.byName.has(entry.name)) return;
        this.byName.set(entry.name, entry);
        const last = splitQualified(entry.name).at(-1) ?? entry.name;
        this.byLastPart.set(last, [...(this.byLastPart.get(last) ?? []), entry]);
    }

    get size(): number {
        return this.byName.size;
    }

    /** Exact qualified name, else a unique match on trailing `::` components (`ecs::Entity`, `Entity`). */
    lookup(query: string): { entry: SymbolEntry } | { candidates: string[] } {
        const name = normalizeSymbolQuery(query);
        const exact = this.byName.get(name);
        if (exact) return { entry: exact };
        const last = splitQualified(name).at(-1) ?? name;
        const matches = (this.byLastPart.get(last) ?? []).filter((e) => e.name.endsWith(`::${name}`));
        if (matches.length === 1 && matches[0]) return { entry: matches[0] };
        // `ResourceManager` also matches its constructor `ResourceManager::ResourceManager`: prefer the type.
        const types = matches.filter((e) => COMPOUND_KINDS.has(e.kind));
        if (types.length === 1 && types[0]) return { entry: types[0] };
        return { candidates: (types.length > 0 ? types : matches).map((e) => e.name) };
    }
}

export interface ResolverOptions {
    /** Locale of the referencing page; ids resolve in this locale, then the default one, then globally. */
    defaultLocale: string;
}

export class RefResolver {
    readonly symbols: SymbolTable;

    constructor(
        private pages: PageIndex,
        api: ApiIndex | null,
        private readonly options: ResolverOptions,
    ) {
        this.symbols = new SymbolTable(api);
    }

    replacePages(pages: PageIndex): void {
        this.pages = pages;
    }

    findPage(id: string, locale: string): PageEntry | undefined {
        for (const candidate of [locale, this.options.defaultLocale, ""]) {
            const page = this.pages.byKey.get(`${candidate}:${id}`);
            if (page) return page;
        }
        return undefined;
    }

    resolve(raw: string, locale: string): Resolution {
        const ref = parseRef(raw);
        if (!ref) return { ok: false, error: `malformed reference "[[${raw}]]"` };
        if (ref.prefix === "luau")
            return { ok: false, error: `the Luau API reference does not exist yet ("[[${raw}]]")` };

        const looksLikePage = PAGE_ID_RE.test(ref.target);
        if (ref.prefix === "page" || (ref.prefix === null && looksLikePage && this.findPage(ref.target, locale))) {
            return this.resolvePage(ref, locale);
        }
        if (ref.prefix === "cpp" || ref.prefix === null) {
            const symbol = this.resolveSymbol(ref);
            if (symbol.ok || ref.prefix === "cpp" || !looksLikePage) return symbol;
        }
        return { ok: false, error: `unknown page id or symbol "${ref.target}"` };
    }

    private resolvePage(ref: ParsedRef, locale: string): Resolution {
        const page = this.findPage(ref.target, locale);
        if (!page) return { ok: false, error: `unknown page id "${ref.target}"` };
        let href = page.url;
        let text = page.title;
        if (ref.anchor) {
            const heading = page.headings.get(ref.anchor);
            if (heading === undefined) {
                return { ok: false, error: `page "${page.id}" (${page.file}) has no heading "#${ref.anchor}"` };
            }
            href += `#${ref.anchor}`;
            text = heading;
        }
        return {
            ok: true,
            ref: { href, text: ref.label ?? text, code: false, preview: page.description, kind: "page" },
        };
    }

    private resolveSymbol(ref: ParsedRef): Resolution {
        if (ref.anchor) return { ok: false, error: `C++ references use "::", not "#" ("${ref.target}#${ref.anchor}")` };
        if (this.symbols.size === 0) {
            return { ok: false, error: `cannot resolve "${ref.target}": the API model is missing, run \`pnpm api\`` };
        }
        const found = this.symbols.lookup(ref.target);
        if ("candidates" in found) {
            if (found.candidates.length === 0) return { ok: false, error: `unknown C++ symbol "${ref.target}"` };
            const list = found.candidates.slice(0, 6).join(", ");
            return { ok: false, error: `ambiguous C++ symbol "${ref.target}", qualify it further: ${list}` };
        }
        return {
            ok: true,
            ref: {
                href: found.entry.href,
                text: ref.label ?? ref.target,
                code: ref.label === null,
                preview: found.entry.preview,
                kind: "symbol",
            },
        };
    }
}
