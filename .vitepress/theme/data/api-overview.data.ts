import docs from "../../../docs.config.ts";
import { loadApiIndex } from "../../../lib/doxygen/load.ts";
import { plainText } from "../../../lib/doxygen/markdown.ts";
import { compoundUrl } from "../../../lib/doxygen/model.ts";

export interface ApiOverviewData {
    available: boolean;
    engine: { repository: string; ref: string; commit: string | null };
    doxygenVersion: string | null;
    namespaces: { name: string; url: string; brief: string; classes: number }[];
    counts: { namespaces: number; classes: number; concepts: number; headers: number };
}

declare const data: ApiOverviewData;
export { data };

/** Build-time summary for the C++ API landing page (the full model never reaches the client). */
export default {
    watch: [docs.apiModelPath],
    load(): ApiOverviewData {
        const index = loadApiIndex(docs.apiModelPath);
        const engine = {
            repository: docs.engine.repository,
            ref: docs.engine.ref,
            commit: index?.model.engine.commit ?? null,
        };
        if (!index) {
            return {
                available: false,
                engine,
                doxygenVersion: null,
                namespaces: [],
                counts: { namespaces: 0, classes: 0, concepts: 0, headers: 0 },
            };
        }
        const compounds = [...index.compounds.values()];
        const count = (kinds: string[]) => compounds.filter((c) => kinds.includes(c.kind)).length;
        return {
            available: true,
            engine,
            doxygenVersion: index.model.doxygenVersion,
            namespaces: compounds
                .filter((c) => c.kind === "namespace")
                .map((c) => ({
                    name: c.name,
                    url: compoundUrl(c),
                    brief: plainText(c.brief),
                    classes: index.children(c).classes.length,
                })),
            counts: {
                namespaces: count(["namespace"]),
                classes: count(["class", "struct", "union"]),
                concepts: count(["concept"]),
                headers: count(["file"]),
            },
        };
    },
};
