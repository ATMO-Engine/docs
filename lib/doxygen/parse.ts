import fs from "node:fs";
import path from "node:path";
import {
    COMPOUND_ROUTES,
    type ApiBaseRef,
    type ApiCompound,
    type ApiEnumValue,
    type ApiLocation,
    type ApiMember,
    type ApiModel,
    type ApiParam,
    type ApiSection,
    type CompoundKind,
    type DocNodes,
} from "./model.ts";
import { RESERVED_ANCHORS } from "./groups.ts";
import { SlugRegistry, slugifySymbol } from "./slug.ts";
import { child, childrenNamed, cleanText, isBlank, parseXml, trimNodes, type XmlElement } from "./xml.ts";

export interface ParseOptions {
    /** Scopes to drop with everything nested in them (`glz`, `atmo::*::detail`). */
    exclude: string[];
    includePrivate: boolean;
    engine: ApiModel["engine"];
}

const KINDS: readonly CompoundKind[] = ["namespace", "class", "struct", "union", "concept", "file"];
const HEADER_RE = /\.(h|hh|hpp|hxx|inl|ipp)$/i;

/** `glz` matches `glz` and everything nested in it; `*` is a wildcard (`atmo::*::detail`). */
export function scopePattern(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}(::.*)?$`);
}

/** Normalizes `glz::meta< atmo::Foo >` to `glz::meta<atmo::Foo>` so names compare predictably. */
export function normalizeName(name: string): string {
    return name
        .replace(/\s+/g, " ")
        .replace(/\s*([<>,:*&()])\s*/g, "$1")
        .replace(/,/g, ", ")
        .trim();
}

function doc(element: XmlElement | undefined): DocNodes {
    if (!element) return [];
    const nodes = trimNodes(element.children);
    return isBlank(nodes) ? [] : nodes;
}

function optionalDoc(element: XmlElement | undefined): DocNodes | null {
    const nodes = doc(element);
    return nodes.length > 0 ? nodes : null;
}

function location(element: XmlElement | undefined): ApiLocation | null {
    const loc = child(element, "location");
    if (!loc?.attrs.file) return null;
    const line = Number.parseInt(loc.attrs.line ?? "", 10);
    return { file: loc.attrs.file.replace(/\\/g, "/"), line: Number.isFinite(line) ? line : null };
}

function params(elements: XmlElement[]): ApiParam[] {
    return elements.map((param) => {
        const name = cleanText(child(param, "declname")) || cleanText(child(param, "defname")) || null;
        return {
            type: doc(child(param, "type")),
            name,
            defaultValue: optionalDoc(child(param, "defval")),
            array: cleanText(child(param, "array")) || null,
        };
    });
}

function templateParams(element: XmlElement): ApiParam[] | null {
    const list = child(element, "templateparamlist");
    return list ? params(childrenNamed(list, "param")) : null;
}

function baseRefs(element: XmlElement, name: string): ApiBaseRef[] {
    return childrenNamed(element, name).map((ref) => ({
        id: ref.attrs.refid ?? null,
        name: normalizeName(cleanText(ref)),
        protection: ref.attrs.prot ?? "public",
        virtual: ref.attrs.virt === "virtual",
    }));
}

function yes(element: XmlElement, attr: string): boolean {
    return element.attrs[attr] === "yes";
}

function parseEnumValue(element: XmlElement): ApiEnumValue {
    return {
        id: element.attrs.id ?? "",
        name: cleanText(child(element, "name")),
        initializer: optionalDoc(child(element, "initializer")),
        brief: doc(child(element, "briefdescription")),
        details: doc(child(element, "detaileddescription")),
    };
}

function parseMember(element: XmlElement): ApiMember {
    const name = cleanText(child(element, "name"));
    const prot = element.attrs.prot;
    const virt = element.attrs.virt;
    return {
        id: element.attrs.id ?? "",
        kind: element.attrs.kind ?? "unknown",
        name,
        qualifiedName: normalizeName(cleanText(child(element, "qualifiedname")) || name),
        anchor: "",
        protection: prot === "protected" || prot === "private" || prot === "package" ? prot : "public",
        isStatic: yes(element, "static"),
        isConst: yes(element, "const"),
        isConstexpr: yes(element, "constexpr"),
        isExplicit: yes(element, "explicit"),
        isInline: yes(element, "inline"),
        isNoexcept: yes(element, "noexcept"),
        virtuality: virt === "virtual" || virt === "pure-virtual" ? virt : "non-virtual",
        type: doc(child(element, "type")),
        argsString: cleanText(child(element, "argsstring")),
        params: params(childrenNamed(element, "param")),
        templateParams: templateParams(element),
        requires: optionalDoc(child(element, "requiresclause")),
        initializer: optionalDoc(child(element, "initializer")),
        enumValues: childrenNamed(element, "enumvalue").map(parseEnumValue),
        isStrongEnum: yes(element, "strong"),
        brief: doc(child(element, "briefdescription")),
        details: doc(child(element, "detaileddescription")),
        location: location(element),
    };
}

function parseCompound(def: XmlElement, includePrivate: boolean): ApiCompound {
    const kind = def.attrs.kind as CompoundKind;
    const rawName = cleanText(child(def, "compoundname"));
    const name = kind === "file" ? (location(def)?.file ?? rawName) : normalizeName(rawName);
    const title = kind === "file" ? path.posix.basename(name) : (splitQualified(name).at(-1) ?? name);
    const includes = child(def, "includes");
    const sections: ApiSection[] = childrenNamed(def, "sectiondef")
        .filter((section) => includePrivate || !(section.attrs.kind ?? "").startsWith("private"))
        .map((section) => ({
            kind: section.attrs.kind ?? "",
            members: childrenNamed(section, "memberdef")
                .map(parseMember)
                .filter((member) => includePrivate || member.protection !== "private"),
        }))
        .filter((section) => section.members.length > 0);

    const inner = (tag: string) =>
        childrenNamed(def, tag)
            .filter((ref) => includePrivate || ref.attrs.prot !== "private")
            .map((ref) => ref.attrs.refid ?? "")
            .filter(Boolean);

    return {
        id: def.attrs.id ?? "",
        kind,
        name,
        title,
        slug: "",
        parent: null,
        brief: doc(child(def, "briefdescription")),
        details: doc(child(def, "detaileddescription")),
        location: location(def),
        include: kind === "file" ? null : includes ? cleanText(includes) : null,
        templateParams: templateParams(def),
        bases: baseRefs(def, "basecompoundref"),
        derived: baseRefs(def, "derivedcompoundref"),
        innerClasses: inner("innerclass"),
        innerNamespaces: inner("innernamespace"),
        innerConcepts: inner("innerconcept"),
        sections,
        conceptInitializer: kind === "concept" ? optionalDoc(child(def, "initializer")) : null,
        isFinal: yes(def, "final"),
        isAbstract: yes(def, "abstract"),
    };
}

/** Splits on `::` outside template brackets: `a::b<c::d>::e` → `["a", "b<c::d>", "e"]`. */
export function splitQualified(name: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (let i = 0; i < name.length; i++) {
        const char = name[i];
        if (char === "<") depth++;
        else if (char === ">") depth = Math.max(0, depth - 1);
        if (depth === 0 && char === ":" && name[i + 1] === ":") {
            parts.push(current);
            current = "";
            i++;
            continue;
        }
        current += char;
    }
    parts.push(current);
    return parts;
}

function isIncluded(
    compound: ApiCompound,
    excludes: RegExp[],
    protections: Map<string, string>,
    includePrivate: boolean,
): boolean {
    if (compound.kind === "file") return HEADER_RE.test(compound.name);
    if (compound.kind === "namespace" && /anonymous_namespace|@\d/.test(compound.name)) return false;
    if (excludes.some((re) => re.test(compound.name))) return false;
    return includePrivate || protections.get(compound.id) !== "private";
}

function hasContent(compound: ApiCompound, kept: Map<string, ApiCompound>): boolean {
    if (compound.kind !== "namespace") return true;
    if (compound.sections.length > 0 || compound.brief.length > 0 || compound.details.length > 0) return true;
    return [...compound.innerClasses, ...compound.innerNamespaces, ...compound.innerConcepts].some((id) =>
        kept.has(id),
    );
}

/** Parses a Doxygen XML output directory (`<out>/xml`) into the API model. */
export function parseDoxygenXml(xmlDir: string, options: ParseOptions): ApiModel {
    const index = parseXml(fs.readFileSync(path.join(xmlDir, "index.xml"), "utf8"));
    const excludes = options.exclude.map(scopePattern);
    const protections = new Map<string, string>();

    const all: ApiCompound[] = [];
    for (const entry of childrenNamed(index, "compound")) {
        const kind = entry.attrs.kind as CompoundKind;
        if (!KINDS.includes(kind) || !entry.attrs.refid) continue;
        const file = path.join(xmlDir, `${entry.attrs.refid}.xml`);
        if (!fs.existsSync(file)) continue;
        const def = child(parseXml(fs.readFileSync(file, "utf8")), "compounddef");
        if (!def) continue;
        protections.set(def.attrs.id ?? "", def.attrs.prot ?? "public");
        all.push(parseCompound(def, options.includePrivate));
    }

    // Filter, then repeatedly drop namespaces left empty by the filter (e.g. `glz` once `glz::*` is excluded).
    let kept = new Map(
        all.filter((c) => isIncluded(c, excludes, protections, options.includePrivate)).map((c) => [c.id, c]),
    );
    for (let changed = true; changed;) {
        const next = new Map([...kept].filter(([, c]) => hasContent(c, kept)));
        changed = next.size !== kept.size;
        kept = next;
    }
    const compounds = [...kept.values()];
    for (const compound of compounds) {
        compound.innerClasses = compound.innerClasses.filter((id) => kept.has(id));
        compound.innerNamespaces = compound.innerNamespaces.filter((id) => kept.has(id));
        compound.innerConcepts = compound.innerConcepts.filter((id) => kept.has(id));
        for (const id of [...compound.innerClasses, ...compound.innerNamespaces, ...compound.innerConcepts]) {
            const inner = kept.get(id);
            if (inner && compound.kind !== "file") inner.parent = compound.id;
        }
    }

    // A member may be listed by both its namespace and its file: it lives on the namespace/class page.
    const homes = new Map<string, ApiCompound>();
    for (const compound of compounds) {
        for (const member of compound.sections.flatMap((s) => s.members)) {
            const home = homes.get(member.id);
            if (!home || (home.kind === "file" && compound.kind !== "file")) homes.set(member.id, compound);
        }
    }
    for (const compound of compounds) {
        compound.sections = compound.sections
            .map((section) => ({ ...section, members: section.members.filter((m) => homes.get(m.id) === compound) }))
            .filter((section) => section.members.length > 0);
    }

    // Deterministic order → stable slugs and anchors across builds.
    compounds.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
    const registries = new Map<string, SlugRegistry>();
    for (const compound of compounds) {
        const route = COMPOUND_ROUTES[compound.kind];
        const registry = registries.get(route) ?? new SlugRegistry();
        registries.set(route, registry);
        compound.slug = registry.claim(slugifySymbol(compound.name));

        const anchors = new SlugRegistry();
        for (const reserved of RESERVED_ANCHORS) anchors.claim(reserved);
        for (const member of compound.sections.flatMap((s) => s.members)) {
            member.anchor = anchors.claim(member.name.startsWith("~") ? "destructor" : slugifySymbol(member.name));
        }
    }

    return {
        schema: 1,
        doxygenVersion: index.attrs.version ?? "unknown",
        engine: options.engine,
        compounds,
    };
}
