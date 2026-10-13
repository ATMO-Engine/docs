/**
 * Generates the C++ API model: runs Doxygen on the engine checkout and converts its XML to
 * `.cache/api/cpp.json`, which the VitePress build turns into pages.
 *
 *   pnpm api                       # engine at ../atmo
 *   ATMO_ENGINE_DIR=/path pnpm api # engine elsewhere
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import config from "../docs.config.ts";
import { ROOT_DIR, fileExists } from "../lib/config.ts";
import { parseDoxygenXml } from "../lib/doxygen/parse.ts";

const outDir = path.join(ROOT_DIR, ".cache", "doxygen");
const xmlDir = path.join(outDir, "xml");

function fail(message: string): never {
    console.error(`\x1b[31m✖\x1b[0m ${message}`);
    process.exit(1);
}

function engineCommit(): string | null {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: config.engineDir, encoding: "utf8" }).trim();
    } catch {
        return null;
    }
}

const engineDoxyfile = path.join(config.engineDir, "Doxyfile");
if (!fileExists(engineDoxyfile)) {
    fail(`No Doxyfile in ${config.engineDir}. Point ATMO_ENGINE_DIR at an engine checkout.`);
}

const version = spawnSync("doxygen", ["--version"], { encoding: "utf8" });
if (version.status !== 0) fail("Doxygen is not installed or not on PATH (https://www.doxygen.nl/download.html).");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// The engine's Doxyfile stays the source of truth for *what* is documented; we only redirect output.
const doxyfile = [
    `@INCLUDE = "${engineDoxyfile}"`,
    `OUTPUT_DIRECTORY = "${outDir}"`,
    "GENERATE_XML = YES",
    "XML_OUTPUT = xml",
    "XML_PROGRAMLISTING = NO",
    "GENERATE_HTML = NO",
    "GENERATE_LATEX = NO",
    "GENERATE_RTF = NO",
    "GENERATE_MAN = NO",
    "HAVE_DOT = NO",
    "CLASS_GRAPH = NO",
    "COLLABORATION_GRAPH = NO",
    "INCLUDE_GRAPH = NO",
    "INCLUDED_BY_GRAPH = NO",
    "STRIP_FROM_INC_PATH = src",
    "QUIET = YES",
    `WARN_LOGFILE = "${path.join(outDir, "warnings.log")}"`,
    "",
].join("\n");
const doxyfilePath = path.join(outDir, "Doxyfile");
fs.writeFileSync(doxyfilePath, doxyfile);

console.log(`Running Doxygen ${version.stdout.trim()} on ${config.engineDir}`);
const run = spawnSync("doxygen", [doxyfilePath], { cwd: config.engineDir, stdio: ["ignore", "inherit", "inherit"] });
if (run.status !== 0) fail(`Doxygen exited with code ${run.status}`);

const model = parseDoxygenXml(xmlDir, {
    exclude: config.api.exclude,
    includePrivate: config.api.includePrivate,
    engine: { repository: config.engine.repository, ref: config.engine.ref, commit: engineCommit() },
});
fs.mkdirSync(path.dirname(config.apiModelPath), { recursive: true });
fs.writeFileSync(config.apiModelPath, JSON.stringify(model));

const counts = new Map<string, number>();
for (const compound of model.compounds) counts.set(compound.kind, (counts.get(compound.kind) ?? 0) + 1);
const summary = [...counts].map(([kind, n]) => `${n} ${kind}`).join(", ");
console.log(`\x1b[32m✔\x1b[0m API model written to ${path.relative(ROOT_DIR, config.apiModelPath)} (${summary})`);
