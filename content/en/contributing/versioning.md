---
id: versioning
title: Versions and branches
order: 2
description: How documentation versions map to engine branches, and how to cut a new one.
---

# Versions and branches

The documentation is versioned like the engine. Each documentation branch is built on its own and published under
its own path:

| URL        | Built from (docs)         | Documents (engine)                               |
| ---------- | ------------------------- | ------------------------------------------------ |
| `/latest/` | `main`                    | `main`, at the newest commit that passed its CI  |
| `/1.0/`    | `1.0`                     | the newest `1.0.x` release                       |
| `/stable/` | the newest release branch | the newest release (a copy of its `/X.Y/` pages) |

The site root redirects to `/stable/`, or to `/latest/` until a first release is published.

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
        ref: "main", // engine branch, or the release tag on a release branch
        ciWorkflow: "build.yml", // engine workflow that must pass for a commit to be documented
    },
    // ...
});
```

`versions.json` on `main` lists every published version. It is deployed at the site root, and every version reads
it at runtime, so the version switcher of an old build also knows about newer releases.

## Automatic updates {#automation}

The site rebuilds itself; nobody needs to deploy by hand.

| When                                                | What is rebuilt                                   |
| --------------------------------------------------- | ------------------------------------------------- |
| A commit lands on the engine's `main` and passes CI | `/latest/`, from that commit                      |
| The engine publishes a patch release (`1.0.3`)      | `/1.0/` (and `/stable/` if 1.0 is stable)         |
| The engine publishes a new minor release (`1.1.0`)  | Nothing yet: a pull request is opened (see below) |
| A commit lands on this repository's `main` or `X.Y` | That version                                      |
| Every night                                         | `/latest/`, in case a notification was missed     |
| Someone runs the **Deploy** workflow by hand        | The version they choose, or `all`                 |

The engine's `notify-docs` workflow sends the notifications. Each build checks out the engine at the resolved
commit, runs Doxygen and commits the result to its folder of the `gh-pages` branch, which GitHub Pages serves.
Versions are published independently: a version that fails to build never blocks the others.

## New releases {#release}

When the engine publishes a new minor release, for example `1.1.0`, the deploy workflow:

1. creates the `1.1` branch from `main`, pinned to the `1.1.0` tag;
2. opens a pull request on `main` adding `1.1` to `versions.json` as the stable version, and marking the previous
   stable version `"maintained"`.

Prepare the `1.1` branch if its pages need changes for the release, then merge the pull request: `/1.1/` is
published and `/stable/` moves to it. Patch releases (`1.1.1`) update the existing `1.1` documentation; they
don't get their own version. Mark versions that no longer receive fixes `"eol"` in `versions.json`.
