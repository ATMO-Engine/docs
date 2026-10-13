import fs from "node:fs";
import type { ApiModel } from "./model.ts";
import { ApiIndex } from "./pages.ts";

const cache = new Map<string, { mtimeMs: number; index: ApiIndex }>();

/**
 * Loads the API model written by `pnpm api`, or returns `null` when it has not been generated yet.
 * Cached per file modification time, so config, route loaders and the reference index share one parse.
 */
export function loadApiIndex(file: string): ApiIndex | null {
    let mtimeMs: number;
    try {
        mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
        return null;
    }
    const cached = cache.get(file);
    if (cached && cached.mtimeMs === mtimeMs) return cached.index;

    const model = JSON.parse(fs.readFileSync(file, "utf8")) as ApiModel;
    if (model.schema !== 1)
        throw new Error(`${file}: unsupported API model schema ${String(model.schema)}, run \`pnpm api\``);
    const index = new ApiIndex(model);
    cache.set(file, { mtimeMs, index });
    return index;
}
