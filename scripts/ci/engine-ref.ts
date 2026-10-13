/**
 * Resolves the engine commit to document for the checked-out docs branch and writes it as the `ref` output.
 *
 *   latest → newest engine commit whose CI workflow passed on push (falls back to the branch head)
 *   X.Y    → newest X.Y.Z release tag (falls back to `engine.ref` in docs.config.ts)
 */
import config from "../../docs.config.ts";
import { latestGreenCommit, latestPatchTag, listTags } from "../../lib/engine.ts";
import { annotate, setOutputs } from "./output.ts";

const token = process.env.GITHUB_TOKEN;
const { repository, ref, ciWorkflow } = config.engine;

if (config.version === "latest") {
    const green = await latestGreenCommit(repository, ciWorkflow, ref, { token });
    if (green) {
        annotate.notice(
            `latest documents ${repository}@${green.slice(0, 7)}, the newest ${ref} commit that passed ${ciWorkflow}`,
        );
        setOutputs({ repository, ref: green, source: "green" });
    } else {
        annotate.warning(
            `No successful push run of ${ciWorkflow} on ${repository}@${ref}: documenting the branch head`,
        );
        setOutputs({ repository, ref, source: "fallback" });
    }
} else {
    const tag = latestPatchTag(await listTags(repository, { token }), config.version);
    if (tag) {
        annotate.notice(`${config.version} documents ${repository}@${tag}`);
        setOutputs({ repository, ref: tag, source: "tag" });
    } else {
        annotate.warning(`No ${config.version}.x release tag on ${repository}: documenting ${ref} from docs.config.ts`);
        setOutputs({ repository, ref, source: "fallback" });
    }
}
