---
id: building-from-source
title: Building from source
order: 1
description: Install the toolchain and build the engine, its tests and the export runtime.
---

# Building from source

## Requirements {#requirements}

ATMO builds with [xmake](https://xmake.io) and a C++23 compiler:

| Platform | Compiler |
| -------- | -------- |
| Windows  | MSVC     |
| macOS    | clang++  |
| Linux    | g++      |

See the [xmake quick start](https://xmake.io/guide/quick-start.html) to install it.

## Clone and build {#build}

```sh
git clone git@github.com:ATMO-Engine/atmo.git
cd atmo
git submodule update --init --recursive
xmake
```

`xmake` builds the `atmo` target (engine and editor) in debug mode. Debug builds enable AddressSanitizer and
UndefinedBehaviorSanitizer on platforms other than Windows.

## Other targets and modes {#targets}

| Command                   | Result                                  |
| ------------------------- | --------------------------------------- |
| `xmake -m release`        | Optimized build (`-O3`)                 |
| `xmake build atmo-test`   | Catch2 unit test binary                 |
| `xmake test -v`           | Run the unit tests                      |
| `xmake build atmo-export` | Export-only runtime, without the editor |
| `xmake clean --mode=soft` | Remove build artifacts                  |

Once the engine builds, continue with the [[architecture]] overview.
