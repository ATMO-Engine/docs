import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncEngineDocs, type EngineDocsOptions } from "../lib/engine-docs.ts";

describe("syncEngineDocs", () => {
    let root: string;
    let options: EngineDocsOptions;
    const write = (file: string, source: string) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), source);
    };
    const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
    const exists = (file: string) => fs.existsSync(path.join(root, file));

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "atmo-engine-docs-"));
        options = {
            engineDocsDir: path.join(root, "engine/docs"),
            contentDir: path.join(root, "content"),
            locales: ["en"],
            manifestPath: path.join(root, "cache/engine-docs.json"),
        };
        write("engine/docs/README.md", "# Not a page\n");
        write("engine/docs/.prettierrc.json", "{}\n");
        write("engine/docs/en/manual/index.md", "# Manual\n");
        write("engine/docs/en/manual/rendering.md", "# Rendering\n");
        write("content/en/index.md", "# Home\n");
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it("copies the locale folders next to the docs repository's pages", () => {
        const sync = syncEngineDocs(options);
        expect(sync.files.sort()).toEqual(["en/manual/index.md", "en/manual/rendering.md"]);
        expect(read("content/en/manual/rendering.md")).toBe("# Rendering\n");
        expect(read("content/en/index.md")).toBe("# Home\n");
        expect(exists("content/README.md")).toBe(false);
    });

    it("only writes changed files and removes deleted ones", () => {
        syncEngineDocs(options);
        expect(syncEngineDocs(options).changed).toBe(0);

        write("engine/docs/en/manual/rendering.md", "# Rendering platforms\n");
        fs.rmSync(path.join(root, "engine/docs/en/manual/index.md"));
        expect(syncEngineDocs(options).changed).toBe(2);
        expect(read("content/en/manual/rendering.md")).toBe("# Rendering platforms\n");
        expect(exists("content/en/manual/index.md")).toBe(false);

        fs.rmSync(path.join(root, "engine/docs/en"), { recursive: true });
        syncEngineDocs(options);
        expect(exists("content/en/manual")).toBe(false);
        expect(exists("content/en/index.md")).toBe(true);
    });

    it("refuses to replace a page of the docs repository", () => {
        write("engine/docs/en/index.md", "# Engine home\n");
        expect(() => syncEngineDocs(options)).toThrow("docs/en/index.md (engine) and content/en/index.md (docs)");
        expect(read("content/en/index.md")).toBe("# Home\n");
    });
});
