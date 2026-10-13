import config from "../../docs.config.ts";
import { loadApiIndex } from "./load.ts";
import { COMPOUND_ROUTES, type CompoundRoute } from "./model.ts";
import { renderCompoundPage } from "./pages.ts";

export interface ApiRouteParams {
    slug: string;
    title: string;
    description: string;
    sourceUrl: string | null;
}

export function engineSourceUrl(file: string, line: number | null, commit: string | null): string {
    const ref = commit ?? config.engine.ref;
    return `https://github.com/${config.engine.repository}/blob/${ref}/${file}${line ? `#L${line}` : ""}`;
}

/** Pages of one route folder for a VitePress `[slug].paths.ts` loader. */
export function apiRoutePaths(route: CompoundRoute): { params: ApiRouteParams; content: string }[] {
    const index = loadApiIndex(config.apiModelPath);
    if (!index) return [];
    const commit = index.model.engine.commit;
    return [...index.compounds.values()]
        .filter((compound) => COMPOUND_ROUTES[compound.kind] === route)
        .map((compound) => {
            const page = renderCompoundPage(compound, index, {
                base: config.base,
                sourceUrl: (file, line) => engineSourceUrl(file, line, commit),
            });
            return {
                params: {
                    slug: page.slug,
                    title: page.title,
                    description: page.description,
                    sourceUrl: page.source ? engineSourceUrl(page.source.file, page.source.line, commit) : null,
                },
                content: page.content,
            };
        });
}
