# ATMO documentation

Source of [docs.atmo-engine.com](https://docs.atmo-engine.com): hand-written guides plus a C++ API reference
generated from the [engine](https://github.com/ATMO-Engine/atmo) with Doxygen. Built with VitePress.

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

| Path               | Contents                                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| `content/en/`      | Hand-written pages (served at the site root; other locales go next to it) |
| `content/api/cpp/` | Dynamic routes rendering the generated C++ reference                      |
| `lib/doxygen/`     | Doxygen XML → API model → Markdown pages                                  |
| `lib/refs/`        | `[[...]]` reference system (page ids, anchors, C++ symbols)               |
| `docs.config.ts`   | Version and engine ref documented by this branch                          |
| `versions.json`    | Published versions, read at runtime by every version's switcher           |

See `content/en/contributing/` for the writing guide and the versioning model.
