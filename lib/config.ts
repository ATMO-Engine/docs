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
        /** Engine git ref (branch or tag) this docs branch documents. */
        ref: string;
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
    /** VitePress base of this build: `siteBase + version + "/"`. */
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
 * - `DOCS_SITE_BASE` sets the deployment prefix (e.g. `/atmo-docs/` on a GitHub Pages project site)
 * - `ATMO_ENGINE_DIR` points at the engine checkout (defaults to `../atmo`)
 * - `ATMO_ENGINE_REF` overrides `engine.ref`
 */
export function resolveDocsConfig(config: DocsConfig, env: NodeJS.ProcessEnv = process.env): ResolvedDocsConfig {
    const version = env.DOCS_VERSION?.trim() || config.version;
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(version)) {
        throw new Error(`Invalid docs version slug "${version}": use lowercase letters, digits, "." and "-".`);
    }
    const siteBase = withSlashes(env.DOCS_SITE_BASE?.trim() || "/");
    return {
        ...config,
        version,
        engine: { ...config.engine, ref: env.ATMO_ENGINE_REF?.trim() || config.engine.ref },
        siteBase,
        base: withSlashes(`${siteBase}${version}`),
        engineDir: path.resolve(ROOT_DIR, env.ATMO_ENGINE_DIR?.trim() || "../atmo"),
        apiModelPath: path.join(ROOT_DIR, ".cache", "api", "cpp.json"),
    };
}

export function fileExists(file: string): boolean {
    try {
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
}
