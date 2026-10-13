import { defineDocsConfig, resolveDocsConfig } from "./lib/config.ts";

/**
 * Per-branch settings. When cutting a release branch (e.g. `1.0`), set `version` to the branch name
 * and `engine.ref` to the matching engine branch or tag. See content/en/contributing/versioning.md.
 */
export const docsConfig = defineDocsConfig({
    version: "latest",
    engine: {
        repository: "ATMO-Engine/atmo",
        ref: "main",
        ciWorkflow: "build.yml",
    },
    repository: "ATMO-Engine/docs",
    hostname: "https://docs.atmo-engine.com",
    api: {
        // Third-party specializations (serializers, formatters) are not part of the engine API.
        exclude: ["glz", "fmt", "std"],
        includePrivate: false,
    },
});

export default resolveDocsConfig(docsConfig);
