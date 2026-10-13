import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDoxygenXml } from "../lib/doxygen/parse.ts";
import { ApiIndex } from "../lib/doxygen/pages.ts";
import type { ApiModel } from "../lib/doxygen/model.ts";

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixtureModel(overrides: { exclude?: string[]; includePrivate?: boolean } = {}): ApiModel {
    return parseDoxygenXml(path.join(FIXTURES, "doxygen"), {
        exclude: overrides.exclude ?? ["glz"],
        includePrivate: overrides.includePrivate ?? false,
        engine: { repository: "ATMO-Engine/atmo", ref: "main", commit: "abc123" },
    });
}

export function fixtureIndex(): ApiIndex {
    return new ApiIndex(fixtureModel());
}

export function compound(model: ApiModel, name: string) {
    const found = model.compounds.find((c) => c.name === name);
    if (!found) throw new Error(`no compound ${name}`);
    return found;
}
