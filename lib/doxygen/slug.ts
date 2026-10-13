/**
 * URL-safe, lowercase slug for a C++ qualified name or file path.
 * `atmo::core::ecs::Entity` → `atmo-core-ecs-entity`, `glz::meta< T >` → `glz-meta-t`,
 * `src/core/engine.hpp` → `src-core-engine-hpp`.
 */
export function slugifySymbol(name: string): string {
    const slug = name
        .replace(/operator\s*([^\w\s]+)/g, (_, op: string) => `operator-${operatorName(op)}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "unnamed";
}

const OPERATOR_NAMES: Record<string, string> = {
    "=": "assign",
    "==": "eq",
    "!=": "ne",
    "<": "lt",
    "<=": "le",
    ">": "gt",
    ">=": "ge",
    "<=>": "spaceship",
    "+": "add",
    "-": "sub",
    "*": "mul",
    "/": "div",
    "%": "mod",
    "+=": "add-assign",
    "-=": "sub-assign",
    "*=": "mul-assign",
    "/=": "div-assign",
    "%=": "mod-assign",
    "++": "inc",
    "--": "dec",
    "!": "not",
    "&&": "and",
    "||": "or",
    "&": "bitand",
    "|": "bitor",
    "^": "xor",
    "~": "compl",
    "<<": "shl",
    ">>": "shr",
    "<<=": "shl-assign",
    ">>=": "shr-assign",
    "&=": "and-assign",
    "|=": "or-assign",
    "^=": "xor-assign",
    "[]": "subscript",
    "()": "call",
    "->": "arrow",
    "->*": "arrow-star",
    ",": "comma",
};

function operatorName(op: string): string {
    return OPERATOR_NAMES[op] ?? "op";
}

/**
 * Hands out unique slugs: the first claimant keeps the plain slug, later ones get `-2`, `-3`...
 * Callers must claim in a deterministic order so URLs stay stable between builds.
 */
export class SlugRegistry {
    private readonly taken = new Set<string>();

    claim(base: string): string {
        let slug = base;
        for (let n = 2; this.taken.has(slug); n++) slug = `${base}-${n}`;
        this.taken.add(slug);
        return slug;
    }
}
