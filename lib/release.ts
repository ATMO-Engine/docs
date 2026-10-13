import type { VersionRegistry } from "./versions.ts";

/**
 * Turns `docs.config.ts` from `main` into the config of a release branch: the branch builds `version`
 * and documents engine tag `tag`.
 */
export function releaseBranchConfig(source: string, version: string, tag: string): string {
    const withVersion = source.replace(/^(\s*version:\s*)"[^"]*"/m, `$1"${version}"`);
    const withRef = withVersion.replace(/^(\s*ref:\s*)"[^"]*"/m, `$1"${tag}"`);
    if (withVersion === source || withRef === withVersion) {
        throw new Error('docs.config.ts: could not find the `version: "..."` and `ref: "..."` fields');
    }
    return withRef;
}

/** Adds a released version to the registry and makes it stable; the previous stable becomes `maintained`. */
export function addReleasedVersion(registry: VersionRegistry, version: string, tag: string): VersionRegistry {
    if (registry.versions.some((v) => v.slug === version)) {
        throw new Error(`versions.json already lists ${version}`);
    }
    const versions = registry.versions.map((v) =>
        v.slug === registry.stable ? { ...v, status: "maintained" as const } : v,
    );
    const entry = { slug: version, label: version, engineRef: tag, status: "stable" as const };
    return {
        stable: version,
        // `latest` first, then releases from newest to oldest.
        versions: [
            ...versions.filter((v) => v.slug === "latest"),
            entry,
            ...versions.filter((v) => v.slug !== "latest"),
        ],
    };
}
