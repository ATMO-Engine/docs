/**
 * Resolves the engine commit to document for `DOCS_VERSION` and writes the `ref` (checkout) and `name` (shown on
 * the site) outputs.
 *
 *   latest → newest documentable commit of the engine branch (falls back to the branch head)
 *   X.Y    → newest X.Y.Z release tag
 */
import config from "../../docs.config.ts";
import { latestDocumentableCommit, latestPatchTag, listTags } from "../../lib/engine.ts";
import { annotate, setOutputs } from "./output.ts";

const token = process.env.GITHUB_TOKEN;
const { repository, ref, workflows } = config.engine;

if (config.version === "latest") {
    const commit = await latestDocumentableCommit(repository, workflows, ref, { token });
    if (commit) {
        annotate.notice(
            `latest documents ${repository}@${commit.slice(0, 7)}, the newest ${ref} commit that passed ${workflows.docs} and did not fail ${workflows.build}`,
        );
        setOutputs({ repository, ref: commit, name: ref, source: "green" });
    } else {
        annotate.warning(`No documentable commit on ${repository}@${ref}: documenting the branch head`);
        setOutputs({ repository, ref, name: ref, source: "fallback" });
    }
} else {
    const tag = latestPatchTag(await listTags(repository, { token }), config.version);
    if (!tag) throw new Error(`No ${config.version}.x release tag on ${repository}`);
    annotate.notice(`${config.version} documents ${repository}@${tag}`);
    setOutputs({ repository, ref: tag, name: tag, source: "tag" });
}
