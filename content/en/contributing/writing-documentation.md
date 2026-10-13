---
id: writing-documentation
title: Writing documentation
order: 1
description: Page ids, references to pages and C++ symbols, and how to preview your changes.
---

# Writing documentation

The site has two halves:

- **Guides and manual** — Markdown files written by hand in `content/en/`.
- **API reference** — generated from the engine's source comments by Doxygen. To change it, edit the comments in
  the engine repository, not this one.

## Running the site locally {#local}

You need Node.js 22 or newer, [pnpm](https://pnpm.io) and [Doxygen](https://www.doxygen.nl), with the engine
cloned next to this repository (`../atmo`).

```sh
pnpm install
pnpm api        # run Doxygen on ../atmo and build the API model
pnpm dev        # http://localhost:5173/latest/
```

Set `ATMO_ENGINE_DIR` if the engine lives somewhere else. Run `pnpm api` again after changing engine comments.

## Pages {#pages}

Every Markdown file under `content/en/` is a page. Its frontmatter controls how it is referenced and listed:

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

Formatting is enforced by Prettier (4 spaces, double quotes). Run `pnpm format` before committing; the
`pnpm format:check` script fails on unformatted files.
