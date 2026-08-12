# Contributing to cipher keel

cipher keel is 0.1 alpha: source and tests exist and are green, and the app is
installable — `npm run dist` builds an unsigned, Apple-Silicon-only DMG — but no release
has been tagged or published yet. Contributions are welcome, with the understanding that
the codebase and its conventions can still move.

## Prerequisites

- **macOS.** tmux, Unix-domain sockets, and Keychain access are all macOS-bound; there is
  no Linux or Windows support target.
- **Node**, at the version pinned in [`.nvmrc`](.nvmrc) (currently 22). See
  [A note on Node versions](#a-note-on-node-versions) below for why this is not optional.
- **tmux**, installed and on `PATH` (e.g. `brew install tmux`).
- **Claude Code CLI**, if you want the full functionality — cipher keel drives it as one
  of the coding CLIs it wraps. The app runs without it, but with a reduced feature set.

## Setup

```bash
npm ci
```

`package.json` carries an `overrides` entry:

```json
"overrides": {
  "@xterm/addon-canvas": {
    "@xterm/xterm": "$@xterm/xterm"
  }
}
```

This exists because `@xterm/addon-canvas` still declares `@xterm/xterm@^5` as a peer
dependency, while this project depends on xterm 6. Upstream has not published a
6-compatible release yet — not even a beta — so without the override, `npm ci` fails
outright on peer resolution. Remove this entry once `@xterm/addon-canvas` ships a release
that accepts xterm 6 as a peer; it is a workaround for an upstream gap, not a project
convention to imitate elsewhere.

### A note on Node versions

The committed lockfile is npm-major-sensitive: it was generated under Node 22 / npm
10.9.x, matching what CI runs. Regenerating it under a different npm major has already
produced a materially different lockfile once and broken `npm ci` on the CI runner as a
result. If you touch dependencies, do it under the `.nvmrc` version, not whatever Node
happens to be active in your shell.

`package.json` declares `"engines": { "node": ">=22" }`, but npm does not enforce
`engines` by default — nothing currently stops a contributor on a newer Node major from
installing anyway and producing a lockfile CI can't consume. That is a known, accepted
gap, not a solved problem; treat the `.nvmrc` pin as the actual contract and `engines` as
documentation only.

## After setup: rebuilding the native module

`better-sqlite3` is a native module, and it has to exist as **two separate builds**:
one compiled against Electron's ABI (used when the app actually runs) and one against
Node's ABI (used by vitest). `src/main/graph/native-binding.ts` resolves the
Electron-ABI build by path at runtime and falls back to the Node-ABI build otherwise —
both need to be present on disk at the same time, in different locations.

If you want the app itself to run — not just the tests — build the Electron-ABI side:

```bash
npm run rebuild-native
```

This script is deliberately two commands chained together:

```json
"rebuild-native": "electron-rebuild --build-from-source --force && npm rebuild better-sqlite3"
```

`electron-rebuild` produces the Electron-ABI build; the trailing `npm rebuild
better-sqlite3` restores the Node-ABI build afterwards, because the first command
overwrites it. Either command alone leaves only one of the two builds present and
silently breaks the other side. Run both, in this order, every time.

**Switching your ambient Node version invalidates the Node-side build.** This is not
theoretical: regenerating the lockfile under Node 22 during this project's CI work
rebuilt the Node-ABI binding for Node 22's ABI, and `npm test` then failed under the
developer's ambient Node 25 with a `NODE_MODULE_VERSION` mismatch. `npm rebuild
better-sqlite3` fixes it — run it any time you switch Node majors and see native-module
errors from vitest.

**A green test suite is not evidence that both builds are healthy.** The Node-ABI side
is the one vitest exercises, and it is also the side that keeps working when the
Electron-ABI side is broken or missing. That means the knowledge graph can be silently
dead in the running app — falling back to no persistence, or failing to initialize —
while every single test passes. This happened for real: it went unnoticed for weeks. Do
not treat `npm test` as proof the app works; see
[Verifying a change in the running app](#verifying-a-change-in-the-running-app).

## The four gates

CI runs exactly these four commands, in exactly this order, on every push and pull
request:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Run them yourself before opening a PR. Green locally means green in CI — there is
nothing else in the pipeline.

A note on `typecheck`: it runs `tsc -b --noEmit --force`, not the more common `tsc
--noEmit`. This project's `tsconfig.json` is solution-style — it declares no files of its
own, only `references` to `tsconfig.node.json` and `tsconfig.web.json`. A plain `tsc
--noEmit` against a solution-style config checks **zero files** and exits 0 unconditionally,
regardless of how broken the code is. That was this repository's actual state until the
gate was fixed to use build mode (`-b`) — the typecheck gate had never checked anything,
and turning it into a real check immediately surfaced 28 pre-existing type errors. If you
ever find yourself "simplifying" this script back to `tsc --noEmit`, don't — it turns the
gate back into a no-op that always passes.

## Verifying a packaged build

`npm test` runs under Node and loads the Node-ABI native build (see
[After setup: rebuilding the native module](#after-setup-rebuilding-the-native-module)
above); the packaged app loads the Electron-ABI build instead. A green test suite says
nothing about whether the package itself works.

```bash
npm run pack            # builds dist/ and produces release/mac-arm64/cipher keel.app
npm run smoke:packaged  # launches that .app and checks the knowledge graph initialises inside it
```

These are not part of the four CI gates above — that is deliberate, not an oversight. Run
them yourself whenever you touch `package.json`'s `build` block or
`electron.vite.config.ts`'s output directories; nothing else in this repository's
workflow would catch a break there.

## Verifying a change in the running app

No test in this repository reaches an `ipcMain` handler — there is no Electron mock, and
vitest runs under plain Node, not Electron. A fully green suite says nothing about
whether IPC wiring, native-module loading, or window behavior actually works in the real
app.

Before claiming a change works, drive the real app using the project skill at
[`.claude/skills/run-keel/`](.claude/skills/run-keel/). It launches cipher keel against a
throwaway profile, lets you invoke IPC handlers and inspect results directly, and shuts
the app (and any tmux sessions it created) down cleanly afterwards.

## Commit style

This project uses [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`, imperative mood, lowercase summary, no trailing period. Common
types in this history: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `ci`, `chore`.
Scope is usually the affected area (`graph`, `notes`, `ui`, `deps`, `renderer`, `main`, …)
and may be omitted when a change is genuinely repo-wide. Look at `git log` for examples
before picking a scope name.
