import path from "node:path";
import { defineConfigWithTheme, type DefaultTheme, type HeadConfig } from "vitepress";
import docs from "../docs.config.ts";
import { ROOT_DIR } from "../lib/config.ts";
import { loadApiIndex } from "../lib/doxygen/load.ts";
import { engineDocsPlugin, syncEngineDocs, type EngineDocsOptions } from "../lib/engine-docs.ts";
import { apiSidebar } from "../lib/doxygen/sidebar.ts";
import { createRefSystem, formatProblems } from "../lib/refs/index.ts";
import { slugify } from "../lib/refs/pages.ts";
import { guideSidebar } from "../lib/sidebar.ts";
import { parseVersionRegistry } from "../lib/versions.ts";
import versionsJson from "../versions.json" with { type: "json" };
import type { AtmoThemeConfig } from "./theme/types.ts";

const CONTENT_DIR = path.join(ROOT_DIR, "content");
/** Locale folders under content/, default first. Add e.g. "fr" here and a `fr` entry in `locales`. */
const LOCALES = ["en"];
const isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");

const versions = parseVersionRegistry(versionsJson);

const engineDocs: EngineDocsOptions = {
    engineDocsDir: docs.engineDocsDir,
    contentDir: CONTENT_DIR,
    locales: LOCALES,
    manifestPath: path.join(ROOT_DIR, ".cache", "engine-docs.json"),
};
let engineFiles = new Set<string>();
try {
    engineFiles = new Set(syncEngineDocs(engineDocs).files);
} catch (error) {
    if (isBuild) throw error;
    console.warn(`\x1b[33m⚠\x1b[0m ${(error as Error).message}`);
}
if (engineFiles.size === 0) {
    const message = `No pages found in ${docs.engineDocsDir}: point ATMO_ENGINE_DIR at an engine checkout.`;
    if (isBuild) throw new Error(message);
    console.warn(`\x1b[33m⚠\x1b[0m ${message}`);
}
const sourceOf = (file: string) => (engineFiles.has(file) ? `engine docs/${file}` : `content/${file}`);

const api = loadApiIndex(docs.apiModelPath);
if (!api) {
    const message = "API model not found: run `pnpm api` to generate the C++ reference.";
    if (isBuild && process.env.DOCS_ALLOW_MISSING_API !== "1") throw new Error(message);
    console.warn(`\x1b[33m⚠\x1b[0m ${message} The /api/cpp/ pages will be empty.`);
}
const refs = createRefSystem({
    contentDir: CONTENT_DIR,
    apiModelPath: docs.apiModelPath,
    locales: LOCALES,
    watch: !isBuild,
});

const apiNavItems: DefaultTheme.NavItemWithLink[] = [
    { text: "C++", link: "/api/cpp/", activeMatch: "^/api/cpp/" },
    { text: "Luau", link: "/api/luau/", activeMatch: "^/api/luau/" },
];

export default defineConfigWithTheme<AtmoThemeConfig>({
    srcDir: "content",
    outDir: "dist",
    base: docs.base,
    cleanUrls: true,
    lang: "en-US",
    title: "ATMO Engine",
    titleTemplate: `:title · ATMO ${docs.version}`,
    description: "Documentation of the ATMO game engine: guides, manual and C++ API reference.",

    // English sources live in content/en/ (so translations can sit next to them) but are served at the root.
    rewrites: { "en/:rest*": ":rest*" },
    locales: {
        root: { label: "English", lang: "en-US" },
    },

    head: [
        ["link", { rel: "icon", type: "image/svg+xml", href: `${docs.base}logo.svg` }],
        ["meta", { name: "docsearch:version", content: docs.version }],
    ],

    markdown: {
        anchor: { slugify },
        languageAlias: { slang: "hlsl" },
        config: (md) => refs.plugin(md),
    },

    vite: {
        plugins: [engineDocsPlugin(engineDocs, (sync) => (engineFiles = new Set(sync.files)))],
    },

    themeConfig: {
        // The logo is rendered by Layout.vue (app icon on an ink tile, as in the editor header).
        siteTitle: "Atmo",
        nav: [
            { text: "Guide", link: "/getting-started/building-from-source", activeMatch: "^/(?!api/)" },
            { text: "API", items: apiNavItems, activeMatch: "^/api/" },
        ],
        sidebar: {
            "/api/cpp/": api
                ? apiSidebar(api)
                : [{ text: "C++ API", items: [{ text: "Overview", link: "/api/cpp/" }] }],
            "/api/luau/": [{ text: "Luau API", items: [{ text: "Overview", link: "/api/luau/" }] }],
            "/": guideSidebar(CONTENT_DIR, "en", LOCALES[0] ?? "en"),
        },
        outline: { level: [2, 3] },
        search: { provider: "local" },
        socialLinks: [{ icon: "github", link: `https://github.com/${docs.engine.repository}` }],
        editLink: {
            // Serialized to the client without its closure: the URL is computed in transformPageData.
            pattern: (page) => String(page.frontmatter.editUrl ?? ""),
            text: "Edit this page on GitHub",
        },
        docFooter: { prev: "Previous", next: "Next" },
        footer: {
            message: "Released under the MIT License.",
            copyright: "© ATMO Engine contributors",
        },
        atmo: {
            version: docs.version,
            pathSlug: docs.pathSlug,
            siteBase: docs.siteBase,
            versions,
            engine: {
                repository: docs.engine.repository,
                ref: docs.engine.ref,
                commit: api?.model.engine.commit ?? null,
            },
        },
    },

    transformHead({ assets, pageData }) {
        const head: HeadConfig[] = [];
        // Preload the UI font (Latin, variable weight) so text renders in Nunito Sans on first paint.
        const font = assets.find((file) => /nunito-sans-latin-wght-normal[^/]*\.woff2$/.test(file));
        if (font) head.push(["link", { rel: "preload", href: font, as: "font", type: "font/woff2", crossorigin: "" }]);
        // `/stable/` duplicates a version: point search engines at the version's own URL.
        if (docs.pathSlug !== docs.version) {
            const page = pageData.relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
            head.push(["link", { rel: "canonical", href: `${docs.hostname}${docs.siteBase}${docs.version}/${page}` }]);
        }
        return head;
    },

    transformPageData(pageData) {
        pageData.frontmatter.editUrl = engineFiles.has(pageData.filePath)
            ? `https://github.com/${docs.engine.repository}/edit/main/docs/${pageData.filePath}`
            : `https://github.com/${docs.repository}/edit/main/content/${pageData.filePath}`;
        // Dynamic API pages: title, description and source link come from the route params.
        const params = pageData.params as { title?: string; description?: string } | undefined;
        if (params?.title) {
            pageData.title = params.title;
            pageData.description = params.description || `${params.title} — ATMO C++ API reference`;
        }
    },

    buildEnd() {
        const problems = refs.problems();
        if (problems.length > 0) {
            throw new Error(`Found ${problems.length} broken reference(s):\n${formatProblems(problems, sourceOf)}`);
        }
    },
});
