# ATMO documentation

Source of [docs.atmo-engine.com](https://docs.atmo-engine.com), built with VitePress. The guides and manual live in
the [engine](https://github.com/ATMO-Engine/atmo) repository's `docs/` folder; this repository holds the site, its
home and contributing pages, and generates the C++ API reference from the engine with Doxygen.

## Quick start

Requires Node.js 22+, pnpm, Doxygen, and the engine cloned next to this repository (`../atmo`).

```sh
pnpm install
pnpm api     # Doxygen → .cache/api/cpp.json (set ATMO_ENGINE_DIR to use another engine checkout)
pnpm dev     # http://localhost:5173/latest/
```

| Script        | Purpose                                                    |
| ------------- | ---------------------------------------------------------- |
| `pnpm build`  | Production build into `dist/` (fails on broken references) |
| `pnpm check`  | Prettier check, type check and unit tests                  |
| `pnpm format` | Format everything with Prettier                            |

## Layout

| Path               | Contents                                                            |
| ------------------ | ------------------------------------------------------------------- |
| `content/en/`      | Site pages, plus the engine's `docs/en/` pages copied at build time |
| `content/api/cpp/` | Dynamic routes rendering the generated C++ reference                |
| `lib/doxygen/`     | Doxygen XML → API model → Markdown pages                            |
| `lib/refs/`        | `[[...]]` reference system (page ids, anchors, C++ symbols)         |
| `docs.config.ts`   | Engine repository, branch and workflows documented by `latest`      |
| `versions.json`    | Published versions, read at runtime by every version's switcher     |

See `content/en/contributing/` for the writing guide and the versioning model.
