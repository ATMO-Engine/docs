/**
 * Edits files when the engine releases a new minor version (used by the deploy workflow's release job):
 *
 *   tsx scripts/ci/release.ts branch-config 1.1 1.1.0   # docs.config.ts of the new 1.1 branch
 *   tsx scripts/ci/release.ts registry 1.1 1.1.0        # versions.json on main: add 1.1, make it stable
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../../lib/config.ts";
import { addReleasedVersion, releaseBranchConfig } from "../../lib/release.ts";
import { parseVersionRegistry } from "../../lib/versions.ts";

const [command, version, tag] = process.argv.slice(2);
if (!command || !version || !tag) throw new Error("usage: release.ts <branch-config|registry> <version> <tag>");

if (command === "branch-config") {
    const file = path.join(ROOT_DIR, "docs.config.ts");
    fs.writeFileSync(file, releaseBranchConfig(fs.readFileSync(file, "utf8"), version, tag));
} else if (command === "registry") {
    const file = path.join(ROOT_DIR, "versions.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const next = addReleasedVersion(parseVersionRegistry(raw), version, tag);
    // Keep extra keys such as "$comment".
    fs.writeFileSync(file, `${JSON.stringify({ ...raw, ...next }, null, 4)}\n`);
} else {
    throw new Error(`unknown command ${command}`);
}
