import { describe, expect, it } from "vitest";
import { planDeploy, type PlanInput } from "../lib/deploy-plan.ts";
import { docsVersionOf, latestGreenCommit, latestPatchTag, parseReleaseTag } from "../lib/engine.ts";
import { addReleasedVersion, releaseBranchConfig } from "../lib/release.ts";
import type { VersionRegistry } from "../lib/versions.ts";

const latestOnly: VersionRegistry = {
    stable: null,
    versions: [{ slug: "latest", label: "latest (main)", engineRef: "main", status: "dev" }],
};

const released: VersionRegistry = {
    stable: "1.1",
    versions: [
        { slug: "latest", label: "latest (main)", engineRef: "main", status: "dev" },
        { slug: "1.1", label: "1.1", engineRef: "1.1.0", status: "stable" },
        { slug: "1.0", label: "1.0", engineRef: "1.0.0", status: "maintained" },
    ],
};

function plan(overrides: Partial<PlanInput> & Pick<PlanInput, "event">) {
    return planDeploy({
        registry: released,
        branches: ["1.0", "1.1"],
        published: ["latest", "1.0", "1.1", "stable"],
        ...overrides,
    });
}

describe("release tags", () => {
    it("parses X.Y.Z tags with an optional v prefix and prerelease", () => {
        expect(parseReleaseTag("1.0.0")).toMatchObject({ major: 1, minor: 0, patch: 0, prerelease: null });
        expect(parseReleaseTag("v2.3.14-beta.1")).toMatchObject({
            major: 2,
            minor: 3,
            patch: 14,
            prerelease: "beta.1",
        });
        expect(parseReleaseTag("nightly")).toBeNull();
        expect(parseReleaseTag("1.0")).toBeNull();
    });

    it("maps a release to its documentation version", () => {
        expect(docsVersionOf("1.1.3")).toBe("1.1");
        expect(docsVersionOf("v0.0.1")).toBe("0.0");
        expect(docsVersionOf("1.2.0-rc.1")).toBeNull();
    });

    it("picks the newest stable patch of a version", () => {
        const tags = ["1.0.0", "v0.0.1", "1.0.2", "1.0.10", "1.1.0", "1.0.11-rc.1", "v1.0.10"];
        expect(latestPatchTag(tags, "1.0")).toBe("1.0.10");
        expect(latestPatchTag(tags, "1.1")).toBe("1.1.0");
        expect(latestPatchTag(tags, "2.0")).toBeNull();
    });

    it("finds the newest commit that passed CI on push", async () => {
        const calls: string[] = [];
        const fakeFetch = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response(JSON.stringify({ workflow_runs: [{ head_sha: "abc123" }] }));
        }) as typeof fetch;
        await expect(latestGreenCommit("ATMO-Engine/atmo", "build.yml", "main", { fetch: fakeFetch })).resolves.toBe(
            "abc123",
        );
        expect(calls[0]).toBe(
            "https://api.github.com/repos/ATMO-Engine/atmo/actions/workflows/build.yml/runs?branch=main&event=push&status=success&per_page=1",
        );
    });
});

describe("planDeploy", () => {
    it("rebuilds latest when the engine's main passes CI, or on schedule", () => {
        for (const event of [{ kind: "engine-main" }, { kind: "schedule" }] as const) {
            expect(plan({ event }).builds).toEqual([{ version: "latest", branch: "main", path: "latest" }]);
        }
    });

    it("rebuilds a release branch, and /stable/ when it is the stable version", () => {
        expect(plan({ event: { kind: "push", branch: "1.0" } }).builds).toEqual([
            { version: "1.0", branch: "1.0", path: "1.0" },
        ]);
        expect(plan({ event: { kind: "push", branch: "1.1" } }).builds).toEqual([
            { version: "1.1", branch: "1.1", path: "1.1" },
            { version: "1.1", branch: "1.1", path: "stable" },
        ]);
    });

    it("builds versions merged into versions.json but not published yet", () => {
        const result = plan({ event: { kind: "push", branch: "main" }, published: ["latest", "1.0"] });
        expect(result.builds.map((b) => b.path)).toEqual(["latest", "1.1", "stable"]);
    });

    it("does not publish a release branch that versions.json doesn't list yet", () => {
        const result = plan({ event: { kind: "push", branch: "1.2" }, branches: ["1.0", "1.1", "1.2"] });
        expect(result.builds).toEqual([]);
        expect(result.notes[0]).toContain("not listed in versions.json");
    });

    it("rebuilds an existing version on a patch release and proposes a new version on a minor release", () => {
        expect(
            plan({ event: { kind: "engine-release", tag: "1.0.3", prerelease: false } }).builds.map((b) => b.path),
        ).toEqual(["1.0"]);
        const minor = plan({ event: { kind: "engine-release", tag: "1.2.0", prerelease: false } });
        expect(minor.builds).toEqual([]);
        expect(minor.propose).toEqual({ version: "1.2", tag: "1.2.0" });
    });

    it("ignores prereleases", () => {
        const result = plan({ event: { kind: "engine-release", tag: "1.2.0-beta.1", prerelease: true } });
        expect(result.builds).toEqual([]);
        expect(result.propose).toBeNull();
    });

    it("rebuilds one or all versions on demand", () => {
        expect(plan({ event: { kind: "manual", version: "all" } }).builds.map((b) => b.path)).toEqual([
            "latest",
            "1.1",
            "stable",
            "1.0",
        ]);
        expect(plan({ event: { kind: "manual", version: "1.0" } }).builds.map((b) => b.path)).toEqual(["1.0"]);
    });

    it("works with only latest, before the first release", () => {
        const result = planDeploy({
            event: { kind: "push", branch: "main" },
            registry: latestOnly,
            branches: [],
            published: [],
        });
        expect(result.builds).toEqual([{ version: "latest", branch: "main", path: "latest" }]);
    });
});

describe("release helpers", () => {
    it("pins a release branch's config to its version and engine tag", () => {
        const source =
            'export const docsConfig = defineDocsConfig({\n    version: "latest",\n    engine: {\n        repository: "ATMO-Engine/atmo",\n        ref: "main",\n        ciWorkflow: "build.yml",\n    },\n});\n';
        const result = releaseBranchConfig(source, "1.2", "1.2.0");
        expect(result).toContain('version: "1.2",');
        expect(result).toContain('ref: "1.2.0",');
        expect(result).toContain('repository: "ATMO-Engine/atmo",');
        expect(() => releaseBranchConfig("export default {}", "1.2", "1.2.0")).toThrow("could not find");
    });

    it("adds a release as the new stable version, after latest", () => {
        const next = addReleasedVersion(released, "1.2", "1.2.0");
        expect(next.stable).toBe("1.2");
        expect(next.versions.map((v) => `${v.slug}:${v.status}`)).toEqual([
            "latest:dev",
            "1.2:stable",
            "1.1:maintained",
            "1.0:maintained",
        ]);
        expect(() => addReleasedVersion(released, "1.1", "1.1.0")).toThrow("already lists");
        expect(addReleasedVersion(latestOnly, "1.0", "1.0.0").versions.map((v) => v.slug)).toEqual(["latest", "1.0"]);
    });
});
