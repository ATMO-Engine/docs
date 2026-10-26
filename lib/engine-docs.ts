import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vitepress";

export interface EngineDocsOptions {
    engineDocsDir: string;
    contentDir: string;
    locales: string[];
    /** Files copied by the previous sync, removed when the engine deletes or renames them. */
    manifestPath: string;
}

export interface EngineDocsSync {
    /** Relative to the content folder (`en/manual/rendering.md`). */
    files: string[];
    changed: number;
}

function walk(dir: string, root: string, out: string[]): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, root, out);
        else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
    return out;
}

function readManifest(file: string): Set<string> {
    try {
        const files = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
        return new Set(Array.isArray(files) ? files.filter((f): f is string => typeof f === "string") : []);
    } catch {
        return new Set();
    }
}

function pruneEmptyDirs(dir: string, root: string): void {
    while (dir.startsWith(root + path.sep) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
    }
}

/**
 * Copies the engine's `docs/<locale>/` pages into `content/<locale>/`, writing only files that changed.
 * Throws if an engine page would replace a page of this repository.
 */
export function syncEngineDocs(options: EngineDocsOptions): EngineDocsSync {
    const previous = readManifest(options.manifestPath);
    const files = options.locales.flatMap((locale) =>
        walk(path.join(options.engineDocsDir, locale), options.engineDocsDir, []),
    );
    const current = new Set(files);

    const collisions = files.filter(
        (file) => !previous.has(file) && fs.existsSync(path.join(options.contentDir, file)),
    );
    if (collisions.length > 0) {
        throw new Error(
            `Engine pages collide with pages of the docs repository:\n${collisions
                .map((file) => `  - docs/${file} (engine) and content/${file} (docs)`)
                .join("\n")}\nRename or move one of them.`,
        );
    }

    let changed = 0;
    for (const file of previous) {
        if (current.has(file)) continue;
        const target = path.join(options.contentDir, file);
        if (fs.existsSync(target)) {
            fs.rmSync(target);
            changed++;
        }
        pruneEmptyDirs(path.dirname(target), options.contentDir);
    }
    for (const file of files) {
        const source = fs.readFileSync(path.join(options.engineDocsDir, file));
        const target = path.join(options.contentDir, file);
        if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, source);
        changed++;
    }

    fs.mkdirSync(path.dirname(options.manifestPath), { recursive: true });
    fs.writeFileSync(options.manifestPath, `${JSON.stringify(files, null, 4)}\n`);
    return { files, changed };
}

/** Re-syncs in the dev server when the engine's pages change. */
export function engineDocsPlugin(options: EngineDocsOptions, onSync: (sync: EngineDocsSync) => void): Plugin {
    return {
        name: "atmo:engine-docs",
        apply: "serve",
        configureServer(server) {
            if (!fs.existsSync(options.engineDocsDir)) return;
            let timer: NodeJS.Timeout | undefined;
            server.watcher.add(options.engineDocsDir);
            server.watcher.on("all", (_event, file) => {
                if (!path.resolve(file).startsWith(options.engineDocsDir + path.sep)) return;
                clearTimeout(timer);
                timer = setTimeout(() => {
                    try {
                        onSync(syncEngineDocs(options));
                    } catch (error) {
                        server.config.logger.error(`[engine-docs] ${(error as Error).message}`);
                    }
                }, 100);
            });
        },
    };
}
