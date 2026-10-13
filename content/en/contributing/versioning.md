---
id: versioning
title: Versions and branches
order: 2
description: How documentation versions map to engine branches, and how to cut a new one.
---

# Versions and branches

The documentation is versioned like the engine. Each documentation branch is built on its own and published under
its own path:

| URL        | Built from (docs)         | Documents (engine)               |
| ---------- | ------------------------- | -------------------------------- |
| `/latest/` | `main`                    | `main`, latest commit passing CI |
| `/1.0/`    | `1.0`                     | the `1.0` release line           |
| `/stable/` | the newest release branch | the newest release               |

The site root redirects to `/stable/`, or to `/latest/` until a first release exists.

## Which branch to target {#target-branch}

Open pull requests against `main`. Fixes that also apply to a released version are cherry-picked onto its
branch.

## How a build knows its version {#config}

`docs.config.ts` on each branch declares the version it builds and the engine ref it documents:

```ts
export const docsConfig = defineDocsConfig({
    version: "latest", // URL prefix of this branch's build
    engine: {
        repository: "ATMO-Engine/atmo",
        ref: "main", // engine branch or tag the API reference is generated from
    },
    // ...
});
```

`versions.json` on `main` lists every published version. It is deployed at the site root, and every version reads
it at runtime, so the version switcher of an old build also knows about newer releases.

## Cutting a release branch {#release}

When the engine releases a new minor version (for example `1.1`):

1. Create the `1.1` branch from `main` in this repository.
2. On that branch, set `version: "1.1"` and `engine.ref` to the engine's `1.1` branch or tag in `docs.config.ts`.
3. On `main`, add the version to `versions.json` and point `stable` at it. Mark the previous release
   `"maintained"` or `"eol"`.

Patch releases (`1.1.1`) update the existing `1.1` documentation; they don't get their own version.
