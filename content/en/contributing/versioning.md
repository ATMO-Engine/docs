---
id: versioning
title: Versions
order: 2
description: How documentation versions map to engine releases, and how they are published.
---

# Versions

The guides and manual live in the engine repository, so each engine commit carries the documentation that matches
it. The site publishes one version per engine release line, plus the development version:

| URL        | Documents (engine)                                   |
| ---------- | ---------------------------------------------------- |
| `/latest/` | `main`, at its newest [documentable commit](#latest) |
| `/1.0/`    | the newest `1.0.x` release tag                       |
| `/stable/` | the newest release (a copy of its `/X.Y/` pages)     |

The site root redirects to `/stable/`, or to `/latest/` until a first release is published.

Every version is built from this repository's `main` branch: the theme, the tooling and the pages of this
repository are the same in every version, only the engine checkout changes. There are no release branches.

## Which commit `latest` documents {#latest}

`latest` documents the newest commit pushed to the engine's `main` that passed the engine's `docs` workflow, and
whose `build` workflow passed or did not run (it skips commits that only change documentation). `docs.config.ts`
names those workflows:

```ts
export const docsConfig = defineDocsConfig({
    version: "latest",
    engine: {
        repository: "ATMO-Engine/atmo",
        ref: "main",
        workflows: { docs: "docs.yml", build: "build.yml" },
    },
    // ...
});
```

`versions.json` lists every published version. It is deployed at the site root, and every version reads it at
runtime, so the version switcher of an old build also knows about newer releases.

## Automatic updates {#automation}

The site rebuilds itself; nobody needs to deploy by hand.

| When                                                | What is rebuilt                                   |
| --------------------------------------------------- | ------------------------------------------------- |
| A commit lands on the engine's `main` and passes CI | `/latest/`                                        |
| The engine publishes a patch release (`1.0.3`)      | `/1.0/` (and `/stable/` if 1.0 is stable)         |
| The engine publishes a new minor release (`1.1.0`)  | Nothing yet: a pull request is opened (see below) |
| A commit lands on this repository's `main`          | Every version                                     |
| Every night                                         | `/latest/`, in case a notification was missed     |
| Someone runs the **Deploy** workflow by hand        | The version they choose, or `all`                 |

The engine's `notify-docs` workflow sends the notifications. Each build checks out the engine at the resolved
commit or tag, copies its `docs/` pages, runs Doxygen and commits the result to its folder of the `gh-pages`
branch, which GitHub Pages serves. Versions are published independently: a version that fails to build never blocks
the others.

## New releases {#release}

When the engine publishes a new minor release, for example `1.1.0`, the deploy workflow opens a pull request adding
`1.1` to `versions.json` as the stable version, and marking the previous stable version `"maintained"`. Merging it
publishes `/1.1/` and moves `/stable/` to it.

Patch releases (`1.1.1`) update the existing `1.1` documentation; they don't get their own version. To fix the
pages of a released version, fix them on the engine's release line and publish a patch release. Mark versions that
no longer receive fixes `"eol"` in `versions.json`.
