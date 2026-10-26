/**
 * Decides what the deploy workflow builds. Run from a clone with `origin/main` fetched. Outputs `matrix` (JSON), `has-builds`, `propose-version` and `propose-tag`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { planDeploy, type DeployEvent } from "../../lib/deploy-plan.ts";
import { parseVersionRegistry } from "../../lib/versions.ts";
import { setOutputs } from "./output.ts";

function git(...args: string[]): string {
    try {
        return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return "";
    }
}

function readEvent(): DeployEvent {
    const name = process.env.GITHUB_EVENT_NAME;
    const payload = process.env.GITHUB_EVENT_PATH
        ? (JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) as Record<string, unknown>)
        : {};
    switch (name) {
        case "push":
            return { kind: "push" };
        case "repository_dispatch": {
            const action = payload.action;
            const client = (payload.client_payload ?? {}) as { tag?: string; prerelease?: boolean | string };
            if (action === "engine-release") {
                return {
                    kind: "engine-release",
                    tag: client.tag ?? "",
                    prerelease: client.prerelease === true || client.prerelease === "true",
                };
            }
            return { kind: "engine-main" };
        }
        case "workflow_dispatch":
            return { kind: "manual", version: process.env.PLAN_VERSION || "latest" };
        case "schedule":
            return { kind: "schedule" };
        default:
            throw new Error(`Unsupported event ${name}`);
    }
}

const registry = parseVersionRegistry(JSON.parse(git("show", "origin/main:versions.json") || "{}"));
const plan = planDeploy({ event: readEvent(), registry });
for (const note of plan.notes) console.log(note);

setOutputs({
    matrix: JSON.stringify({ include: plan.builds }),
    "has-builds": String(plan.builds.length > 0),
    "propose-version": plan.propose?.version ?? "",
    "propose-tag": plan.propose?.tag ?? "",
});
