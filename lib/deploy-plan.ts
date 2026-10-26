import { docsVersionOf } from "./engine.ts";
import type { VersionRegistry } from "./versions.ts";

/** One build of the site: `version` built from the docs `main` branch, published under `path`. */
export interface BuildTarget {
    version: string;
    path: string;
}

export interface ReleaseProposal {
    /** Documentation version to create, e.g. `1.1`. */
    version: string;
    tag: string;
}

export interface DeployPlan {
    builds: BuildTarget[];
    propose: ReleaseProposal | null;
    /** Human-readable reasons, printed in the workflow log. */
    notes: string[];
}

export type DeployEvent =
    | { kind: "push" }
    | { kind: "engine-main" }
    | { kind: "engine-release"; tag: string; prerelease: boolean }
    | { kind: "manual"; version: string }
    | { kind: "schedule" };

export interface PlanInput {
    event: DeployEvent;
    /** versions.json of the docs `main` branch. */
    registry: VersionRegistry;
}

function targetsFor(version: string, registry: VersionRegistry): BuildTarget[] {
    const targets = [{ version, path: version }];
    if (registry.stable === version) targets.push({ version, path: "stable" });
    return targets;
}

/** Decides what a deploy run builds, from the event that triggered it and the published versions. */
export function planDeploy({ event, registry }: PlanInput): DeployPlan {
    const listed = new Set(registry.versions.map((v) => v.slug));
    const builds: BuildTarget[] = [];
    const notes: string[] = [];
    let propose: ReleaseProposal | null = null;

    const add = (version: string, why: string) => {
        if (version !== "latest" && !listed.has(version)) {
            notes.push(`skip ${version}: not listed in versions.json (${why})`);
            return;
        }
        builds.push(...targetsFor(version, registry));
        notes.push(`build ${version}: ${why}`);
    };

    switch (event.kind) {
        case "push":
            add("latest", "docs main changed");
            for (const version of registry.versions) {
                if (version.slug !== "latest") add(version.slug, "docs main changed");
            }
            break;
        case "engine-main":
        case "schedule":
            add("latest", event.kind === "schedule" ? "scheduled refresh" : "engine main passed CI");
            break;
        case "engine-release": {
            const version = docsVersionOf(event.tag);
            if (!version || event.prerelease) {
                notes.push(`engine release ${event.tag} is a prerelease or not X.Y.Z: nothing to publish`);
            } else if (listed.has(version)) {
                add(version, `engine released ${event.tag}`);
            } else {
                propose = { version, tag: event.tag };
                notes.push(`engine released ${event.tag}: propose a new ${version} documentation version`);
            }
            break;
        }
        case "manual":
            if (event.version === "all") {
                for (const version of registry.versions) add(version.slug, "manual run");
            } else {
                add(event.version, "manual run");
            }
            break;
    }

    const unique = builds.filter((b, i) => builds.findIndex((o) => o.path === b.path) === i);
    return { builds: unique, propose, notes };
}
