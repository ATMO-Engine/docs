import type { ApiCompound, ApiMember } from "./model.ts";

/** Display groups of a compound page, in page order. Each id is also the group heading's anchor. */
export const MEMBER_GROUPS = [
    { id: "types", title: "Types" },
    { id: "constructors", title: "Constructors" },
    { id: "functions", title: "Functions" },
    { id: "static-functions", title: "Static functions" },
    { id: "operators", title: "Operators" },
    { id: "variables", title: "Variables" },
    { id: "static-variables", title: "Static variables" },
    { id: "macros", title: "Macros" },
    { id: "friends", title: "Friends" },
] as const;

export type MemberGroupId = (typeof MEMBER_GROUPS)[number]["id"];

/**
 * Fixed headings of a compound page. Member anchors must never reuse these: VitePress throws on duplicate
 * explicit heading ids, so every generated heading carries an explicit, pre-claimed id (`overview` is the h1).
 */
export const PAGE_ANCHORS = [
    "overview",
    "description",
    "inheritance",
    "namespaces",
    "classes",
    "concepts",
    "summary",
] as const;

export const RESERVED_ANCHORS: readonly string[] = [...PAGE_ANCHORS, ...MEMBER_GROUPS.map((g) => g.id)];

export function memberGroup(member: ApiMember, owner: Pick<ApiCompound, "title">): MemberGroupId {
    switch (member.kind) {
        case "typedef":
        case "enum":
            return "types";
        case "define":
            return "macros";
        case "friend":
            return "friends";
        case "function":
            if (member.name === owner.title || member.name === `~${owner.title}`) return "constructors";
            if (member.name.startsWith("operator")) return "operators";
            return member.isStatic ? "static-functions" : "functions";
        default:
            return member.isStatic ? "static-variables" : "variables";
    }
}
