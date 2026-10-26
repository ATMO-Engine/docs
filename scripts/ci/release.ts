/**
 * Adds a released version to versions.json as the stable version:
 *
 *   tsx scripts/ci/release.ts 1.1 1.1.0
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../../lib/config.ts";
import { addReleasedVersion } from "../../lib/release.ts";
import { parseVersionRegistry } from "../../lib/versions.ts";

const [version, tag] = process.argv.slice(2);
if (!version || !tag) throw new Error("usage: release.ts <version> <tag>");

const file = path.join(ROOT_DIR, "versions.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
const next = addReleasedVersion(parseVersionRegistry(raw), version, tag);
// Keep extra keys such as "$comment".
fs.writeFileSync(file, `${JSON.stringify({ ...raw, ...next }, null, 4)}\n`);
