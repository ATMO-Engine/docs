import type MarkdownIt from "markdown-it";
import { loadApiIndex } from "../doxygen/load.ts";
import type { ApiIndex } from "../doxygen/pages.ts";
import { buildPageIndex } from "./pages.ts";
import { refsPlugin, type RefProblem } from "./plugin.ts";
import { RefResolver } from "./resolve.ts";

export interface RefSystemOptions {
    contentDir: string;
    apiModelPath: string;
    /** Locale folders, default locale first. */
    locales: string[];
    /** Re-scan pages when they may have changed (dev server). */
    watch: boolean;
}

export interface RefSystem {
    plugin(md: MarkdownIt): void;
    /** Problems found so far: broken references and invalid page ids. */
    problems(): RefProblem[];
    resolver(): RefResolver;
}

const RESCAN_INTERVAL_MS = 1000;

export function createRefSystem(options: RefSystemOptions): RefSystem {
    const problems = new Map<string, RefProblem>();
    let api: ApiIndex | null = loadApiIndex(options.apiModelPath);
    let pages = buildPageIndex(options.contentDir, { locales: options.locales });
    let scannedAt = Date.now();
    let resolver = new RefResolver(pages, api, { defaultLocale: options.locales[0] ?? "en" });

    const current = (): RefResolver => {
        if (!options.watch || Date.now() - scannedAt < RESCAN_INTERVAL_MS) return resolver;
        scannedAt = Date.now();
        pages = buildPageIndex(options.contentDir, { locales: options.locales });
        const latestApi = loadApiIndex(options.apiModelPath);
        if (latestApi !== api) {
            api = latestApi;
            resolver = new RefResolver(pages, api, { defaultLocale: options.locales[0] ?? "en" });
        } else {
            resolver.replacePages(pages);
        }
        return resolver;
    };

    // VitePress renders some pages twice (page + search index), once under the rewritten path
    // (`manual/x.md` instead of `en/manual/x.md`): report each problem once, under its source path.
    const defaultLocalePrefix = `${options.locales[0] ?? "en"}/`;
    const sourcePath = (file: string) =>
        options.locales.some((locale) => file.startsWith(`${locale}/`)) || file.startsWith("api/")
            ? file
            : `${defaultLocalePrefix}${file}`;
    const report = (problem: RefProblem) => {
        const file = sourcePath(problem.file);
        const key = `${file}\0${problem.ref}`;
        if (problems.has(key)) return;
        problems.set(key, { ...problem, file });
        if (options.watch) console.warn(`\x1b[33m[refs]\x1b[0m ${file}: ${problem.ref} → ${problem.message}`);
    };

    return {
        plugin(md) {
            // A proxy keeps the plugin pointed at the freshest resolver without re-registering rules.
            const resolverProxy = {
                resolve: (raw: string, locale: string) => current().resolve(raw, locale),
            } as RefResolver;
            refsPlugin(md, { resolver: resolverProxy, locales: options.locales, report });
        },
        problems() {
            const indexProblems = pages.errors.map((message) => ({
                file: message.split(":")[0] ?? "",
                ref: "",
                message,
            }));
            return [...indexProblems, ...problems.values()];
        },
        resolver: current,
    };
}

export function formatProblems(problems: RefProblem[], sourceOf: (file: string) => string = (file) => file): string {
    return problems
        .map(
            (p) =>
                `  - ${sourceOf(p.file)}${p.ref ? `: ${p.ref}` : ""}\n      ${p.ref ? p.message : p.message.replace(/^[^:]*:\s*/, "")}`,
        )
        .join("\n");
}
