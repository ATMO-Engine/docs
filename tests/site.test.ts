import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineDocsConfig, resolveDocsConfig, ROOT_DIR } from "../lib/config.ts";
import { guideSidebar } from "../lib/sidebar.ts";
import { parseVersionRegistry, switchVersionPath, versionNotice, type VersionRegistry } from "../lib/versions.ts";
import versionsJson from "../versions.json" with { type: "json" };

describe("version registry", () => {
    const registry: VersionRegistry = {
        stable: "1.1",
        versions: [
            { slug: "latest", label: "latest", engineRef: "main", status: "dev" },
            { slug: "1.1", label: "1.1", engineRef: "1.1", status: "stable" },
            { slug: "1.0", label: "1.0", engineRef: "1.0", status: "eol" },
        ],
    };

    it("accepts the committed versions.json", () => {
        expect(() => parseVersionRegistry(versionsJson)).not.toThrow();
    });

    it("validates untrusted JSON", () => {
        expect(parseVersionRegistry(registry)).toEqual(registry);
        expect(() => parseVersionRegistry(null)).toThrow("expected an object");
        expect(() => parseVersionRegistry({ stable: null, versions: [{ slug: "a" }] })).toThrow("needs string");
        expect(() => parseVersionRegistry({ stable: "2.0", versions: registry.versions })).toThrow(
            'stable "2.0" is not a listed version',
        );
        expect(() =>
            parseVersionRegistry({ stable: null, versions: [registry.versions[0], registry.versions[0]] }),
        ).toThrow("duplicate slug");
        expect(() =>
            parseVersionRegistry({ stable: null, versions: [{ ...registry.versions[0], status: "beta" }] }),
        ).toThrow("unknown status");
    });

    it("decides which banner a version shows", () => {
        expect(versionNotice(registry, "latest")).toMatchObject({ kind: "dev", stable: { slug: "1.1" } });
        expect(versionNotice(registry, "1.1")).toEqual({ kind: "none" });
        expect(versionNotice(registry, "1.0")).toMatchObject({ kind: "outdated", current: { slug: "1.0" } });
        expect(versionNotice(registry, "0.9")).toMatchObject({ kind: "unlisted" });
        expect(versionNotice({ ...registry, stable: null }, "latest")).toEqual({ kind: "dev", stable: null });
    });

    it("maps the current page to another version", () => {
        expect(switchVersionPath("/latest/manual/scenes", "/", "latest", "1.1")).toBe("/1.1/manual/scenes");
        expect(switchVersionPath("/docs/1.0/api/cpp/", "/docs/", "1.0", "latest")).toBe("/docs/latest/api/cpp/");
        expect(switchVersionPath("/elsewhere", "/", "latest", "1.1")).toBe("/1.1/");
    });
});

describe("resolveDocsConfig", () => {
    const base = defineDocsConfig({
        version: "latest",
        engine: {
            repository: "ATMO-Engine/atmo",
            ref: "main",
            workflows: { docs: "docs.yml", build: "build.yml" },
        },
        repository: "ATMO-Engine/docs",
        hostname: "https://docs.atmo-engine.com",
        api: { exclude: [], includePrivate: false },
    });

    it("derives the base from the site base and the version", () => {
        const config = resolveDocsConfig(base, {});
        expect(config.siteBase).toBe("/");
        expect(config.base).toBe("/latest/");
        expect(config.engineDir).toBe(path.resolve(ROOT_DIR, "../atmo"));
        expect(config.engineDocsDir).toBe(path.resolve(ROOT_DIR, "../atmo/docs"));
    });

    it("applies environment overrides", () => {
        const config = resolveDocsConfig(base, {
            DOCS_VERSION: "1.0",
            DOCS_SITE_BASE: "docs",
            ATMO_ENGINE_DIR: "/tmp/engine",
            ATMO_ENGINE_REF: "v1.0.2",
        });
        expect(config.base).toBe("/docs/1.0/");
        expect(config.siteBase).toBe("/docs/");
        expect(config.engineDir).toBe("/tmp/engine");
        expect(config.engine.ref).toBe("v1.0.2");
    });

    it("publishes an alias build under its own path while keeping the version identity", () => {
        const config = resolveDocsConfig(base, {
            DOCS_VERSION: "1.1",
            DOCS_PATH: "stable",
            DOCS_SITE_BASE: "/docs/",
            DOCS_HOSTNAME: "https://atmo-engine.github.io/",
        });
        expect(config.version).toBe("1.1");
        expect(config.pathSlug).toBe("stable");
        expect(config.base).toBe("/docs/stable/");
        expect(config.hostname).toBe("https://atmo-engine.github.io");
        expect(resolveDocsConfig(base, {}).pathSlug).toBe("latest");
    });

    it("rejects version slugs that are unsafe in URLs", () => {
        expect(() => resolveDocsConfig(base, { DOCS_VERSION: "1.0/../x" })).toThrow("Invalid docs version");
        expect(() => resolveDocsConfig(base, { DOCS_VERSION: "Latest" })).toThrow("Invalid docs version");
    });
});

describe("guideSidebar", () => {
    let dir: string;
    const write = (file: string, source: string) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), source);
    };

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atmo-sidebar-"));
        write("en/index.md", "---\nlayout: home\n---\n");
        write("en/manual/index.md", "---\ntitle: Manual\norder: 2\n---\n");
        write("en/manual/zeta.md", "# Zeta\n");
        write("en/manual/alpha.md", "---\norder: 5\n---\n# Alpha\n");
        write("en/manual/beta.md", "---\norder: 1\nsidebarTitle: Beta (short)\ntitle: Beta long\n---\n");
        write("en/manual/advanced/deep-dive.md", "# Deep dive {#deep}\n");
        write("en/getting-started/index.md", "---\ntitle: Getting started\norder: 1\n---\n");
        write("en/getting-started/hidden.md", "---\nsidebar: false\n---\n# Hidden\n");
        write("en/empty/.gitkeep", "");
    });

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it("builds ordered sections from folders and frontmatter", () => {
        expect(guideSidebar(dir, "en", "en")).toEqual([
            { text: "Getting started", link: "/getting-started/" },
            {
                text: "Manual",
                link: "/manual/",
                collapsed: false,
                items: [
                    { text: "Beta (short)", link: "/manual/beta" },
                    { text: "Alpha", link: "/manual/alpha" },
                    {
                        text: "Advanced",
                        collapsed: true,
                        items: [{ text: "Deep dive", link: "/manual/advanced/deep-dive" }],
                    },
                    { text: "Zeta", link: "/manual/zeta" },
                ],
            },
        ]);
    });

    it("returns nothing for a missing locale", () => {
        expect(guideSidebar(dir, "de", "en")).toEqual([]);
    });
});
