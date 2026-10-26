---
id: writing-documentation
title: Writing documentation
order: 1
description: Page ids, references to pages and C++ symbols, and how to preview your changes.
---

# Writing documentation

The site has three sources:

- **Guides and manual** — Markdown files in the engine repository, under `docs/en/`. Update them in the pull request
  that changes the behavior they describe.
- **API reference** — generated from the engine's source comments by Doxygen. To change it, edit the comments in
  the engine repository.
- **Site pages** — the home page and these contributing pages, in this repository under `content/en/`.

When the site is built, the engine's `docs/en/` pages are copied into `content/en/`, so both sets of pages form one
tree and can reference each other. A page can't exist in both repositories.

## Running the site locally {#local}

You need Node.js 22 or newer, [pnpm](https://pnpm.io) and [Doxygen](https://www.doxygen.nl), with this repository
cloned next to the engine (`../atmo`).

```sh
pnpm install
pnpm api        # run Doxygen on ../atmo and build the API model
pnpm dev        # http://localhost:5173/latest/
```

Set `ATMO_ENGINE_DIR` if the engine lives somewhere else. Edits to the engine's `docs/` pages show up in the dev
server right away; run `pnpm api` again after changing engine comments.

The copied engine pages are ignored by git in this repository. A new page owned by this repository must be added
to the exceptions at the end of its `.gitignore`.

## Pages {#pages}

Every Markdown file under the engine's `docs/en/` and this repository's `content/en/` is a page. Its frontmatter controls how it is referenced and listed:

```md
---
id: building-from-source # stable id used by references, required to be referenced
title: Building from source # sidebar and link text (defaults to the first heading)
order: 1 # position in its sidebar section (lower first, then alphabetical)
description: Install the toolchain and build the engine. # used in link previews and search results
---
```

Folders become sidebar sections; a folder's `index.md` gives the section its title, link and `order`. Add
`sidebar: false` to keep a page or folder out of the sidebar.

## References {#references}

Link to other pages and to C++ symbols with double brackets. References are resolved when the site is built, so
links survive files being moved or renamed, and **a broken reference fails the build**.

| You write                              | Links to                                                   |
| -------------------------------------- | ---------------------------------------------------------- |
| `[[building-from-source]]`             | The page with that `id`, using its title as link text      |
| `[[building-from-source#build]]`       | A heading on that page, using the heading as link text     |
| `[[building-from-source\|this guide]]` | The same page, with custom link text                       |
| `[[atmo::core::Engine]]`               | The API page of a C++ symbol, shown as code                |
| `[[EntityRegistry]]`                   | The same, matched on the end of the qualified name         |
| `[[Engine::run()]]`                    | A member function (trailing `()` is optional)              |
| `[[page:...]]` / `[[cpp:...]]`         | Forces a page id or a C++ symbol when a name could be both |

Hovering a reference shows the target's description (the page's `description`, or the symbol's brief comment).

### Symbol names {#symbol-names}

A C++ reference can use any trailing part of the qualified name, as long as it matches exactly one symbol. When a
type and its constructor both match (`ResourceManager`), the type wins. If a name is ambiguous, the build lists the
candidates; write more of the name, e.g. `[[core::Engine]]` instead of `[[Engine]]`.

### Heading anchors {#anchors}

Anchors are generated from heading text. To keep a link stable when a heading is reworded, give the heading an
explicit id:

```md
## Clone and build {#build}
```

Anchors on the current page don't need a reference: use a regular link, `[text](#anchor)`.

## Style {#style}

Formatting is enforced by Prettier (4 spaces, double quotes). In this repository, run `pnpm format` before
committing; the `pnpm format:check` script fails on unformatted files. For engine pages, run
`pnpm exec prettier --write ../atmo/docs` from this repository.

## Checks on engine pull requests {#engine-checks}

The engine's `docs` workflow runs on every pull request and push. It builds the site from the pull request's
checkout with the tooling of this repository's `main` branch, so it fails when a page is not formatted, or when a
reference is broken: a renamed class, a removed page or heading. Fix the reference in the same pull request.
