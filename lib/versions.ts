/**
 * Version registry shared by the build and the browser. Kept free of Node imports on purpose.
 */

/** `dev`: tracks engine main. `stable`/`maintained`: receives fixes. `eol`: frozen. */
export type VersionStatus = "dev" | "stable" | "maintained" | "eol";

export interface VersionEntry {
    slug: string;
    label: string;
    engineRef: string;
    status: VersionStatus;
}

export interface VersionRegistry {
    /** Slug that `/stable/` points at, `null` until the first release branch exists. */
    stable: string | null;
    versions: VersionEntry[];
}

const STATUSES: readonly VersionStatus[] = ["dev", "stable", "maintained", "eol"];

/** Validates untrusted JSON (fetched at runtime) and returns a registry, or throws. */
export function parseVersionRegistry(input: unknown): VersionRegistry {
    if (typeof input !== "object" || input === null) throw new Error("versions.json: expected an object");
    const raw = input as Record<string, unknown>;
    if (!Array.isArray(raw.versions)) throw new Error("versions.json: `versions` must be an array");

    const versions = raw.versions.map((entry, index): VersionEntry => {
        const v = entry as Record<string, unknown>;
        if (typeof v.slug !== "string" || typeof v.label !== "string" || typeof v.engineRef !== "string") {
            throw new Error(`versions.json: entry ${index} needs string slug, label and engineRef`);
        }
        if (!STATUSES.includes(v.status as VersionStatus)) {
            throw new Error(`versions.json: entry ${index} has unknown status ${String(v.status)}`);
        }
        return { slug: v.slug, label: v.label, engineRef: v.engineRef, status: v.status as VersionStatus };
    });

    const slugs = new Set<string>();
    for (const { slug } of versions) {
        if (slugs.has(slug)) throw new Error(`versions.json: duplicate slug "${slug}"`);
        slugs.add(slug);
    }

    const stable = raw.stable ?? null;
    if (stable !== null && (typeof stable !== "string" || !slugs.has(stable))) {
        throw new Error(`versions.json: stable "${String(stable)}" is not a listed version`);
    }
    return { stable, versions };
}

export type VersionNotice =
    | { kind: "none" }
    | { kind: "dev"; stable: VersionEntry | null }
    | { kind: "outdated"; current: VersionEntry; stable: VersionEntry }
    | { kind: "unlisted"; stable: VersionEntry | null };

/** Decides which banner (if any) a page of version `slug` shows. */
export function versionNotice(registry: VersionRegistry, slug: string): VersionNotice {
    const stable = registry.versions.find((v) => v.slug === registry.stable) ?? null;
    const current = registry.versions.find((v) => v.slug === slug);
    if (!current) return { kind: "unlisted", stable };
    if (current.status === "dev") return { kind: "dev", stable };
    if (stable && current.slug !== stable.slug) return { kind: "outdated", current, stable };
    return { kind: "none" };
}

/**
 * Maps the current location to the same page in another version.
 * `pathname` is the full browser path, e.g. `/docs/1.0/manual/scenes#nodes`.
 */
export function switchVersionPath(pathname: string, siteBase: string, from: string, to: string): string {
    const prefix = `${siteBase}${from}/`;
    const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
    return `${siteBase}${to}/${rest}`;
}
