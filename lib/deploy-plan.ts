import { docsVersionOf } from "./engine.ts";
import type { VersionRegistry } from "./versions.ts";

/** One build of the site: a docs branch built as `version`, published under `path`. */
export interface BuildTarget {
    version: string;
    branch: string;
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
    | { kind: "push"; branch: string }
    | { kind: "engine-main" }
    | { kind: "engine-release"; tag: string; prerelease: boolean }
    | { kind: "manual"; version: string }
    | { kind: "schedule" };

export interface PlanInput {
    event: DeployEvent;
    /** versions.json of the docs `main` branch. */
    registry: VersionRegistry;
    /** Release branches of the docs repository (`1.0`, `1.1`...). */
    branches: string[];
    /** Top-level folders already published on gh-pages. */
    published: string[];
}

export const RELEASE_BRANCH_RE = /^\d+\.\d+$/;

function targetsFor(version: string, registry: VersionRegistry): BuildTarget[] {
    const branch = version === "latest" ? "main" : version;
    const targets = [{ version, branch, path: version }];
    if (registry.stable === version) targets.push({ version, branch, path: "stable" });
    return targets;
}

/** Decides what a deploy run builds, from the event that triggered it and the current state of the site. */
export function planDeploy({ event, registry, branches, published }: PlanInput): DeployPlan {
    const listed = new Set(registry.versions.map((v) => v.slug));
    const builds: BuildTarget[] = [];
    const notes: string[] = [];
    let propose: ReleaseProposal | null = null;

    const add = (version: string, why: string) => {
        if (version !== "latest" && !listed.has(version)) {
            notes.push(`skip ${version}: not listed in versions.json on main (${why})`);
            return;
        }
        if (version !== "latest" && !branches.includes(version)) {
            notes.push(`skip ${version}: no "${version}" branch in the docs repository (${why})`);
            return;
        }
        builds.push(...targetsFor(version, registry));
        notes.push(`build ${version}: ${why}`);
    };

    switch (event.kind) {
        case "push":
            if (event.branch === "main") {
                add("latest", "docs main changed");
                // A merged release PR lists a version that was never published: build it now.
                for (const version of registry.versions) {
                    if (version.slug === "latest") continue;
                    const missing =
                        !published.includes(version.slug) ||
                        (registry.stable === version.slug && !published.includes("stable"));
                    if (missing) add(version.slug, "listed but not published yet");
                }
            } else if (RELEASE_BRANCH_RE.test(event.branch)) {
                add(event.branch, "release branch changed");
            } else {
                notes.push(`skip push to ${event.branch}: not main or a release branch`);
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
            } else if (branches.includes(version)) {
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
