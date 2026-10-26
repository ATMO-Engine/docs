import { defineDocsConfig, resolveDocsConfig } from "./lib/config.ts";

/** See content/en/contributing/versioning.md. */
export const docsConfig = defineDocsConfig({
    version: "latest",
    engine: {
        repository: "ATMO-Engine/atmo",
        ref: "main",
        workflows: { docs: "docs.yml", build: "build.yml" },
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
