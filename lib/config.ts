import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root of the docs project. */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface DocsConfig {
    /**
     * Slug of the version built from this branch. It becomes the URL prefix (`/latest/`, `/1.0/`...).
     * `main` builds `latest`; each release branch (`1.0`, `1.1`...) builds its own minor version.
     */
    version: string;
    engine: {
        /** GitHub `owner/name` of the engine repository. */
        repository: string;
        /**
         * Engine git ref this docs branch documents: `main` for `latest`, the release tag (`1.1.0`) on a release
         * branch. In CI, `scripts/engine-ref.ts` refines it (latest green commit, newest patch release).
         */
        ref: string;
        /** Engine workflow whose success marks a commit as documentable (`build.yml` builds and runs the tests). */
        ciWorkflow: string;
    };
    /** GitHub `owner/name` of this docs repository, used for "edit this page" links. */
    repository: string;
    /** Public origin of the deployed site, without trailing slash. */
    hostname: string;
    api: {
        /** C++ scopes left out of the API reference, with everything nested in them (`*` wildcard). */
        exclude: string[];
        /** Also document `private` members. */
        includePrivate: boolean;
    };
}

export function defineDocsConfig(config: DocsConfig): DocsConfig {
    return config;
}

export interface ResolvedDocsConfig extends DocsConfig {
    /** Path under which every version is deployed (`/` on a custom domain). Always ends with `/`. */
    siteBase: string;
    /**
     * URL segment of this build. Usually the version; `stable` for the second build of the stable version,
     * whose pages then point their canonical URL at the version's own path.
     */
    pathSlug: string;
    /** VitePress base of this build: `siteBase + pathSlug + "/"`. */
    base: string;
    /** Local checkout of the engine Doxygen runs on. */
    engineDir: string;
    /** Where the generated API model is read from and written to. */
    apiModelPath: string;
}

function withSlashes(value: string): string {
    return `/${value}/`.replace(/\/{2,}/g, "/");
}

/**
 * Applies environment overrides on top of `docs.config.ts`:
 * - `DOCS_VERSION` overrides `version`
 * - `DOCS_PATH` publishes the build under another URL segment (`stable`), defaults to the version
 * - `DOCS_SITE_BASE` sets the deployment prefix (e.g. `/docs/` on a GitHub Pages project site)
 * - `DOCS_HOSTNAME` overrides `hostname` (e.g. `https://atmo-engine.github.io` before the custom domain)
 * - `ATMO_ENGINE_DIR` points at the engine checkout (defaults to `../atmo`)
 * - `ATMO_ENGINE_REF` overrides `engine.ref`
 */
export function resolveDocsConfig(config: DocsConfig, env: NodeJS.ProcessEnv = process.env): ResolvedDocsConfig {
    const version = slug(env.DOCS_VERSION?.trim() || config.version, "version");
    const pathSlug = slug(env.DOCS_PATH?.trim() || version, "path");
    const siteBase = withSlashes(env.DOCS_SITE_BASE?.trim() || "/");
    return {
        ...config,
        version,
        pathSlug,
        hostname: (env.DOCS_HOSTNAME?.trim() || config.hostname).replace(/\/+$/, ""),
        engine: { ...config.engine, ref: env.ATMO_ENGINE_REF?.trim() || config.engine.ref },
        siteBase,
        base: withSlashes(`${siteBase}${pathSlug}`),
        engineDir: path.resolve(ROOT_DIR, env.ATMO_ENGINE_DIR?.trim() || "../atmo"),
        apiModelPath: path.join(ROOT_DIR, ".cache", "api", "cpp.json"),
    };
}

function slug(value: string, what: string): string {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(value)) {
        throw new Error(`Invalid docs ${what} slug "${value}": use lowercase letters, digits, "." and "-".`);
    }
    return value;
}

export function fileExists(file: string): boolean {
    try {
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
}
