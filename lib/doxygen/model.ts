import type { XmlNode } from "./xml.ts";

/**
 * Serializable C++ API model extracted from Doxygen XML (written to .cache/api/cpp.json).
 * Descriptions are kept as Doxygen doc trees so rendering can evolve without re-running Doxygen.
 */
export interface ApiModel {
    schema: 1;
    doxygenVersion: string;
    engine: {
        repository: string;
        ref: string;
        /** Commit the model was generated from, when the engine checkout is a git repository. */
        commit: string | null;
    };
    compounds: ApiCompound[];
}

/** Doc tree: Doxygen description XML, verbatim. */
export type DocNodes = XmlNode[];

export type CompoundKind = "namespace" | "class" | "struct" | "union" | "concept" | "file";

/** Route folder of each compound kind: `/api/cpp/<route>/<slug>`. */
export const COMPOUND_ROUTES = {
    namespace: "namespace",
    class: "class",
    struct: "class",
    union: "class",
    concept: "concept",
    file: "file",
} as const satisfies Record<CompoundKind, string>;

export type CompoundRoute = (typeof COMPOUND_ROUTES)[CompoundKind];

export interface ApiLocation {
    file: string;
    line: number | null;
}

export interface ApiParam {
    type: DocNodes;
    name: string | null;
    defaultValue: DocNodes | null;
    array: string | null;
}

export interface ApiBaseRef {
    /** Refid of the base/derived compound when it is part of the model. */
    id: string | null;
    name: string;
    protection: string;
    virtual: boolean;
}

export interface ApiEnumValue {
    id: string;
    name: string;
    initializer: DocNodes | null;
    brief: DocNodes;
    details: DocNodes;
}

export interface ApiMember {
    id: string;
    kind: string;
    name: string;
    qualifiedName: string;
    /** Fragment id on the owning page, unique within it. */
    anchor: string;
    protection: "public" | "protected" | "private" | "package";
    isStatic: boolean;
    isConst: boolean;
    isConstexpr: boolean;
    isExplicit: boolean;
    isInline: boolean;
    isNoexcept: boolean;
    virtuality: "non-virtual" | "virtual" | "pure-virtual";
    type: DocNodes;
    argsString: string;
    params: ApiParam[];
    templateParams: ApiParam[] | null;
    requires: DocNodes | null;
    initializer: DocNodes | null;
    enumValues: ApiEnumValue[];
    isStrongEnum: boolean;
    brief: DocNodes;
    details: DocNodes;
    location: ApiLocation | null;
}

export interface ApiSection {
    /** Doxygen sectiondef kind, e.g. `public-func`, `public-static-attrib`, `func`, `define`. */
    kind: string;
    members: ApiMember[];
}

export interface ApiCompound {
    id: string;
    kind: CompoundKind;
    /** Fully qualified name (`atmo::core::ecs::Entity`) or, for files, the path relative to the engine root. */
    name: string;
    /** Last name component (`Entity`), or file basename. */
    title: string;
    /** URL segment, unique within the compound's route. */
    slug: string;
    /** Enclosing namespace or class refid. */
    parent: string | null;
    brief: DocNodes;
    details: DocNodes;
    location: ApiLocation | null;
    /** Header to include, relative to the engine include root (`core/ecs/entity.hpp`). */
    include: string | null;
    templateParams: ApiParam[] | null;
    bases: ApiBaseRef[];
    derived: ApiBaseRef[];
    innerClasses: string[];
    innerNamespaces: string[];
    innerConcepts: string[];
    sections: ApiSection[];
    /** Concept definition (`requires ...`). */
    conceptInitializer: DocNodes | null;
    isFinal: boolean;
    isAbstract: boolean;
}

export function compoundUrl(compound: Pick<ApiCompound, "kind" | "slug">): string {
    return `/api/cpp/${COMPOUND_ROUTES[compound.kind]}/${compound.slug}`;
}
