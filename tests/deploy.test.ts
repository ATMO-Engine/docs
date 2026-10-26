import { describe, expect, it } from "vitest";
import { planDeploy, type PlanInput } from "../lib/deploy-plan.ts";
import { docsVersionOf, latestDocumentableCommit, latestPatchTag, parseReleaseTag } from "../lib/engine.ts";
import { addReleasedVersion } from "../lib/release.ts";
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
    return planDeploy({ registry: released, ...overrides });
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

    it("documents the newest commit that passed the docs check and did not fail the build", async () => {
        const builds: Record<string, { conclusion: string | null }[]> = {
            c3: [{ conclusion: null }],
            c2: [{ conclusion: "failure" }],
            c1: [],
        };
        const calls: string[] = [];
        const fakeFetch = (async (input: string | URL | Request) => {
            const url = new URL(String(input));
            calls.push(url.pathname + url.search);
            const sha = url.searchParams.get("head_sha");
            const runs = sha
                ? (builds[sha] ?? []).map((run) => ({ head_sha: sha, status: "completed", ...run }))
                : ["c3", "c2", "c1", "c0"].map((head_sha) => ({
                      head_sha,
                      status: "completed",
                      conclusion: "success",
                  }));
            return new Response(JSON.stringify({ workflow_runs: runs }));
        }) as typeof fetch;

        const workflows = { docs: "docs.yml", build: "build.yml" };
        await expect(
            latestDocumentableCommit("ATMO-Engine/atmo", workflows, "main", { fetch: fakeFetch }),
        ).resolves.toBe("c1");
        expect(calls[0]).toBe(
            "/repos/ATMO-Engine/atmo/actions/workflows/docs.yml/runs?branch=main&event=push&status=success&per_page=20",
        );
        expect(calls).toHaveLength(4);
    });
});

describe("planDeploy", () => {
    it("rebuilds latest when the engine's main passes CI, or on schedule", () => {
        for (const event of [{ kind: "engine-main" }, { kind: "schedule" }] as const) {
            expect(plan({ event }).builds).toEqual([{ version: "latest", path: "latest" }]);
        }
    });

    it("rebuilds every version when docs main changes", () => {
        expect(plan({ event: { kind: "push" } }).builds).toEqual([
            { version: "latest", path: "latest" },
            { version: "1.1", path: "1.1" },
            { version: "1.1", path: "stable" },
            { version: "1.0", path: "1.0" },
        ]);
    });

    it("does not build a version that versions.json doesn't list", () => {
        const result = plan({ event: { kind: "manual", version: "1.2" } });
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
        const result = planDeploy({ event: { kind: "push" }, registry: latestOnly });
        expect(result.builds).toEqual([{ version: "latest", path: "latest" }]);
    });
});

describe("release helpers", () => {
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
