/**
 * Writes the files at the root of the published site, next to the version folders:
 * versions.json, a redirect from the root to the default version, the 404 page and `.nojekyll`.
 *
 *   tsx scripts/ci/site-root.ts <gh-pages checkout>
 */
import fs from "node:fs";
import path from "node:path";
import config from "../../docs.config.ts";
import { ROOT_DIR } from "../../lib/config.ts";
import { parseVersionRegistry } from "../../lib/versions.ts";

const target = process.argv[2];
if (!target) throw new Error("usage: site-root.ts <site directory>");

const raw = fs.readFileSync(path.join(ROOT_DIR, "versions.json"), "utf8");
const registry = parseVersionRegistry(JSON.parse(raw));
const home = `${config.siteBase}${registry.stable ? "stable" : "latest"}/`;

fs.writeFileSync(path.join(target, "versions.json"), raw);
fs.writeFileSync(path.join(target, ".nojekyll"), "");
fs.writeFileSync(
    path.join(target, "index.html"),
    `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>ATMO Engine documentation</title>
<meta http-equiv="refresh" content="0; url=${home}">
<link rel="canonical" href="${config.hostname}${home}">
<a href="${home}">ATMO Engine documentation</a>
</html>
`,
);

// GitHub Pages serves only the root 404.html; the default version's page works for every path.
const notFound = path.join(target, registry.stable ? "stable" : "latest", "404.html");
if (fs.existsSync(notFound)) fs.copyFileSync(notFound, path.join(target, "404.html"));

console.log(`Site root written: / → ${home}`);
