# cipher keel

**A tmux multiplexer around official coding CLIs, with a knowledge graph as its substrate.**

<p>
  <img alt="Status" src="https://img.shields.io/badge/status-0.1%20alpha-orange?style=flat-square&labelColor=000000">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square&labelColor=000000">
  <img alt="CI" src="https://github.com/cmarkus42-rgb/cipher-keel-electron/actions/workflows/ci.yml/badge.svg">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey?style=flat-square&labelColor=000000">
</p>

> **0.1 alpha — installable, unsigned, Apple Silicon only.** `npm run dist` builds a
> packaged, unsigned DMG from this branch. The click-through path — create a project,
> open the grid, start a session — is wired end to end, and the knowledge graph is
> verified to come up inside that packaged build. What is missing is product polish,
> not a working system. Read this repository as a working system under construction.
> See [Current state](#current-state) for exactly what is and isn't wired up.

---

## What this is

cipher keel is an Electron application that puts a process around AI coding agents.

It runs official coding CLIs — Claude Code today, Codex and Gemini as candidates — as
tmux sessions in a grid, and adds the thing that a chat window fundamentally cannot give
you: **continuity**. Every requirement, spec, handover document, gate verdict and repo
link becomes a typed node in a local SQLite knowledge graph. Sessions read from it and
write back to it. What one session decided is available to the next one, three phases
later, without anyone re-explaining it.

It is the successor project to [cipher-mux](https://github.com/cmarkus42-rgb/cipher-mux-electron),
built from the ground up around the graph rather than around a message bus.

## The problem it addresses

Running a single coding agent on a large project fails in a predictable way. Context
windows fill up and get compacted, so decisions silently disappear. Knowledge lives in
transcripts, so nothing is queryable. Handovers between roles are prose, so they are
lossy. And quality ends up depending on which model you happened to use, rather than on
how well the work was cut into pieces.

cipher keel treats those four as engineering problems with concrete mechanisms: a graph
instead of transcripts, a phase contract instead of prose handovers, rolling summaries
instead of compaction, and an explicit granularity obligation on every task that gets
dispatched.

## Core concepts

### 1. Two legs, running alongside each other

**Leg 1** is a tmux multiplexer around official CLIs. Sessions are real terminal sessions
that survive an app restart or a crash. Using the vendor's own CLI keeps the setup inside
the vendor's terms of service, and it inherits whatever the CLI can do — `CLAUDE.md`,
skills, MCP servers.

**Leg 2** is the API and multi-model path (Ollama, OpenAI, DeepSeek). It was originally
planned around NanoClaw as a third-party peer runtime, connected through a channel skill
over a Unix domain socket; NanoClaw was superseded on 2026-08-16 in favour of a harness
keel builds itself, for the reason recorded in
[`docs/anpassbare-flaechen.md`](docs/anpassbare-flaechen.md). The runtime value
`keel-harness` now has an adapter (2026-08-23) — it backs exactly one preset,
`keel-Arbeiter (Niveau B)`, as a grid cell around keel's own loop. OpenCode, Codex and
Gemini remain unbuilt as adapters.

The two legs run *next to* each other, not inside each other. Cross-runtime orchestration
— one leg spawning a sub-session on the other — is explicitly deferred to a later version.
Deciding this up front is what keeps v1 buildable.

### 2. Three tool levels (A / B / C)

Every preset runs at one of three levels, which describes how much of the harness it can rely on:

| Level | Name | Target harness | Capability depth |
|-------|------|----------------|------------------|
| **A** | Full | Claude Code (CLAUDE.md, skills, MCP) | Full capability palette |
| **B** | Portable | keel's own harness, OpenCode, Codex, Gemini | Core capabilities, API-compatible |
| **C** | Minimal | "Configured folder" for pi and local models | Basic structure, assistive mode |

Level C is usable as a structured thinking partner, but is deliberately **not** recommended
as a full realisation of a role. Level B is the recommended minimum for a role to actually
carry its own weight.

**The level follows the harness, not the user.** Each adapter declares the level it can
serve — `claude-code` serves A, `keel-harness` serves B (`RUNTIMES_WITHOUT_ADAPTER` in
`src/main/agent/registry.ts` is empty as of 2026-08-23). A session inherits the level of
the adapter that will actually run it; there is no free choice, because the level
describes a capability of the harness rather than a preference.

What the level changes, concretely, is how the capability layer reaches the agent. At A the
prompt carries `@`-references and the harness resolves them on demand; **measured on
2026-08-11, the content behind those references is not in the start context** — inflating
one referenced file from 4 KB to 271 KB left the token count unchanged to the digit. At B
the same capabilities arrive as an inventory of name, description and path, because a
non-Claude harness would not resolve an `@`-line and would lose the whole layer without a
single error message.

Level B is assembled and inspectable today (see the prompt preview below), and since
2026-08-23 one preset actually runs on it end to end — `keel-Arbeiter (Niveau B)`, the
`keel-harness` adapter's grid cell (see [Current state](#current-state) and
[What a Niveau-B cell can and cannot do](#what-is-not-there-yet)). No other level-B
harness (OpenCode, Codex, Gemini) exists yet.

### 3. Level service — the granularity obligation

This is the least obvious concept and probably the most consequential one.

A level is not only a property of the entity (*which level do I run at*) but also a
requirement on its **outputs** (*which level must be able to consume what I produce*).
An entity running at level A must still produce work packages that a level-C worker — a
13B local model — can execute.

The test question before any dispatch: **can a developer who has never seen this project
start this task from the task text alone?**

The consequence is a hard granularity rule: one item per task, no multi-bug bundles,
interface contracts without implicit context, trigger pointers carrying full context.
Without it, output quality silently becomes a function of model choice instead of task design.

### 4. Knowledge graph as substrate

A local SQLite graph (`better-sqlite3`, WAL mode) with `sqlite-vec` for embeddings.

- **Typed artefact graph** — nodes for requirements, specs, handover documents, sessions,
  gate verdicts, GitHub repositories; typed edges between them
- **Hybrid retrieval** — FTS5 full-text plus vector search, fused via Reciprocal Rank
  Fusion, so keyword hits and semantic hits are ranked into one result list
- **Recursive CTEs** for multi-hop traversal and neighbourhood expansion
- **Token-frugal by design** — the search path targets under 2,000 tokens for ten hits,
  with full nodes loaded on demand instead of up front
- **Traceability gates as graph queries** — "does a predecessor node exist for this?" is a
  query, not a checklist. Gates are informative, not blocking
- **Obsidian vault as a source** — YAML frontmatter and `[[wikilinks]]` are parsed into the
  graph, inferred edges are written back, writes are atomic (temp file plus rename), and
  file deletions propagate

An MCP server exposes seven graph tools (`graph_search`, `graph_get_node`, `graph_expand`,
`graph_query`, `graph_upsert_node`, `graph_link`, `graph_maintain`) so sessions can query
their own project history. It runs in-process in the Electron main process rather than as
a separate stdio server.

### 5. Eight phases with a uniform contract

| Phase | Core |
|-------|------|
| Ideation | Idea → stakeholder requirements, use cases |
| Requirements Engineering | Requirements catalogue under all constraints |
| Architecture & modularisation | Subsystems, 1:n mapping, requirement packages |
| Development | The build |
| Testing | Test cases, results, bug reports |
| Fixing | Bugfix loop, dispatched by suitability |
| Audit | Overall assessment, release recommendation |
| Release Management | Publication, accompanying material |

Every phase satisfies the same three-part contract: **input** (resolved as a graph query,
not a fixed predecessor pointer — which is what makes lateral entry into a running project
possible), **artefacts** (accumulated during the phase), and **output** (a handover document).

That input is carried into the session: an entity's prompt ends with the phasenoutput
artefacts of the preceding phase, named by uid, title and path. They are pointers rather
than inlined text — the artefacts can be arbitrarily large, and every entity that receives
them can query the graph. An entity bound to no phase gets no such layer; one bound to
several (the Workshop, across fixing and development) gets a block per phase.

Seven document types carry the output between phases, each with a default addressee that
frontmatter can override: requirements → refinement, spec → architect, architecture package →
cyber factory, build package → testing, test findings → fixing, fix report → audit,
audit summary → release management. Nine REQ-ID prefixes (`SA`, `REQ`, `NFR`, `BUG`, `MFR`,
`NRF`, `C`, `M`, `N`) are each bound to the phase that may assign them.

### 6. Five entities

| Preset | Role |
|--------|------|
| **Systems Engineer** | Project leadership and gate verdicts. Splits into a lead SE and sub-project SEs when a system is decomposed |
| **Architect** | Long-running companion: worker supervision, interface coaching, wave coordination |
| **Cyber Factory** | Lean build master, coordinates worker sessions in parallel |
| **Testing Assistant** | Checks the suite, judges test quality, documents findings |
| **Workshop** | Convergence of orchestrator and bugfixer in one pattern, with its own routing authority (internal / debugger / escalation) |

### 7. Rolling summary instead of compaction

Long-running sessions do not compact. They persist their state as graph nodes after every
gate verdict, every trigger and every completed item, and reconstruct it from those summary
nodes at session start. Compaction cuts context and loses information; a rolling summary
means the session state is documented at all times and is queryable by other sessions.

### 8. GitHub integration and a deterministic kickoff

Repository creation goes through the `gh` CLI first, with an Octokit fallback. A
`github_repo` node is anchored at the project root, so repository state lives in the same
graph as everything else. Tokens are stored in the macOS keychain and masked in error
messages. An optional GitHub MCP server entry can be generated for the project.

The kickoff wizard is **deterministic** — five steps, no LLM: project name, git init,
graph init, tool config, GitHub. Project setup is not a place where a model should be
improvising.

## Current state

All 2760 tests pass across 203 test files (`npm test`, ~7s).

| Phase | Content | Status |
|-------|---------|--------|
| BT-1a | Knowledge graph foundation — schema, node/edge types, writer | Done |
| BT-1bc | MCP tools, Obsidian vault integration, chunking and embeddings | Done |
| BT-2b | NanoClaw bridge and channel adapter | Superseded — removed 2026-08-17, see below |
| BT-3d | Voice pipeline (Whisper STT, Piper/macOS TTS) and notes system | Done |
| Wave 4 | Graph wired into the Electron main process, NFR checks | Done |
| Phase 3a | Process completion — phase contract, gates, subsystem cycle | Done, audited |
| Phase 3b | GitHub integration and kickoff wizard | Done, audited |
| Phase 3c | Systems Engineer preset, entity assembly | Done, audited |
| Phase 4 | Architect and Cyber Factory presets | Done, audited |
| Phase 5 | Stabilisation — Kanban, session snapshots, vault validator, status bar | Done, audited |
| Phase 6 | Service lifecycle, event bus, degraded-state surfacing, a deterministic kickoff → project window → grid → session path | Done |
| Phase 7 | CI pipeline — typecheck, lint, test and build gating every push and PR | Done |
| Phase 8 | Packaging — separate build output, an archive limited to the built app, an Apple-Silicon-only DMG target, a generated app icon, the asar path fix that lets the knowledge graph initialise inside a package, an automated smoke test against the packaged app, and comprehensible messages for missing CLI tools | Done, unreleased |
| Entity start path | `session:create` assembles the entity prompt and launches the CLI with it — before this, it opened a bare shell | Done |
| Level and adapter wiring | The level follows the adapter, model tiers resolve, capability packages are the single source per entity, level B emits an inventory instead of nothing, and a prompt preview shows all of it before anything starts | Done — the NanoClaw adapter this phase originally registered was removed 2026-08-17 with the rest of the subsystem; level B now runs on keel's own harness (see the `keel-harness` adapter row below) |
| `keel-harness` adapter | Turns the harness loop into a grid session: a `keel-Arbeiter (Niveau B)` preset, a `sitzung:niveau-b` assignment slot, a cell with its own order field, event panel and cancel button. Verified end to end in the running app, not only in tests — see the bullet below and the field protocol it links | Done — 2026-08-23, field-verified |
| Phaseninput layer | The fifth assembly layer: the preceding phase's output artefacts, resolved from the graph into the prompt | Done |
| Model layer | A model registry with capability records, seven tier/role/session slots (three tiers, plus tagging, worker, researcher, and the `sitzung:niveau-b` grid-cell assignment), endpoint resolution and keychain-backed API keys, all editable in the settings window | Done |
| Harness core | keel's own agent loop around a model: build the prompt, read the answer, run tools, check budgets, write everything to an event log. Read-only tools (file, directory, content search, knowledge graph), a stable/volatile prefix split for cache reuse, deferred schema loading | Done — 2026-08-18 |
| Net access and researcher | Two network paths at different trust levels. `web_suchen`/`seite_lesen` run in the main loop but only against an allowlist of vendor documentation; `recherchieren` is an encapsulated sub-run for everything else, with its own registry that carries no file and no graph tool, returning text plus a source list. The difference is one field — the netwatch's mode. Search providers: SearXNG (self-hosted) and Tavily | Done — 2026-08-23, measured |

The harness stretch was measured rather than assumed. Five rounds of real research runs
against a local 27B, plus a separate 40-run measurement of whether the model reads a skill
before using it, are recorded in `docs/superpowers/plans/` — including the rounds that were
thrown away because the machine, not the code, was what they measured.

Phases 3a through 5 each ended in a formal audit with a RELEASE verdict; findings are
recorded in `docs/superpowers/specs/`. Phase 6 and Phase 7 completed without that same
formal audit step; their work is tracked in `docs/superpowers/plans/` instead.

### Seeing what an entity is told

Every preset in the launcher carries an eye button next to it. It assembles that entity's
full prompt — body, capabilities, persona, global rules, phase input — and shows it without
starting a session, writing a file or touching the project directory, with a switch for all
three levels including C, which no adapter serves yet.

The preview is built by the same code path `session:create` uses, and that is checked rather
than assumed: in the running app the preview text and the file handed to the CLI were
compared character by character and were identical. A preview that shows something other
than what is delivered would be worse than none (CK-NFR-012).

### What is not there yet

- **Unsigned and unnotarised.** The DMG needs a manual `xattr -cr` after install (see
  [Install](#install)). Signing is a deliberate 0.1 decision, not an oversight —
  revisit it if the project finds real distribution
- **A settings window now covers most of the config, but not all of it.** Opened from the
  project window's header ("Einstellungen"), it has four tabs: model registry and the six
  tier/role assignments with their fallback endpoints, network access (search provider, both
  API keys, SearXNG endpoint, allowlist), CLI start parameters per adapter, and speech
  output. `ui.*` never existed as an adjustable surface — the dark theme, layout and
  grid are hardcoded — so there is nothing to add a UI for there. Which surfaces are
  adjustable, where each one lives, and which are visible or editable today is inventoried
  in [`docs/anpassbare-flaechen.md`](docs/anpassbare-flaechen.md) (CK-NFR-012)
- **The permission-skip flag has an in-app toggle now.** Every session the app launches runs
  `claude` with `--dangerously-skip-permissions` by default — this is a deliberate 0.1
  decision (2026-08-10), not an oversight: the app itself launches the agent, so it also owns
  the decision to skip Claude Code's own permission prompts. It moved from a fixed
  `agent.skipPermissions` boolean to a free-text `agent.startArgs['claude-code']` line
  (2026-08-17), editable in the settings window's "CLI-Start" tab — clearing the flag there
  turns it off for the next session. Hand-editing `agent.skipPermissions` in the config file
  no longer works: `migriere()` deletes that key on the next app start
- **macOS on Apple Silicon only.** tmux plus Unix domain sockets plus keychain. Linux is
  an intended later target and nothing in the packaging setup blocks it; Windows is not
  planned. There is no Intel build
- **Idle RAM budget and cold-start time unverified.** The <300 MB / <5s targets are
  architecturally supported (lazy init, WAL, no in-memory cache, deferred service start)
  but have not been measured against a production build
- **What a Niveau-B cell can and cannot do.** `RUNTIMES_WITHOUT_ADAPTER` is empty now —
  `keel-harness` has an adapter, a `sitzung:niveau-b` assignment slot in
  `model/slots.ts`, and a real cell in the grid. Verified in the running app (not only in
  tests, which cannot reach `ipcMain` at all — see
  [`docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md`](docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md)):
  a cell is started from the launcher like any preset, and it freezes the registry entry
  the `sitzung:niveau-b` slot named *at cell creation* — reassigning the slot afterwards
  changes what the *next* cell gets, not this one, confirmed by opening a cell, changing
  the slot, and reading the open cell's own header unchanged. Real orders against the DGX
  Spark landed a second order into the *same* run (`auftrag.folgend`, one `laufId`) four
  times running — five real orders total, the first of which opened the run rather than
  continuing one — because the budget check that decides this (`weiterOderFrisch`) found
  headroom left each time: by the fifth order, runden stood at 56% of its narrowed
  threshold and wall-clock time at 61% of its own — the higher of the two — while
  context stayed under 5%, so a sixth or seventh order would plausibly have tripped the
  wall clock, not the context window. A model-specific
  "this one always falls back to fresh" rule does not exist; the same check starts a
  fresh `laufId` once it finds no headroom, which this field session never forced far
  enough to trigger (the fresh-on-exhaustion side is unit-tested, not field-forced here —
  see the protocol for the exact numbers). Starting a cell against an empty slot refuses
  with a named reason in the launcher tile itself. A second order into a cell that
  already has one running is blocked one step earlier than that: the cell disables its
  own order field and button as soon as it goes `laeuft`, so an ordinary user never
  reaches a rejection message here at all — the backend guard behind it
  (`session:auftrag` returning a named refusal) is real and was exercised directly, not
  through a click, since the UI's own protection stands in the way of reaching it by
  clicking.

  What it does **not** do, on purpose, in 0.1: **no beauftragen von oben** — only a human
  typing into that cell's own field can give it an order; no other role or phase step can
  hand it a follow-up job programmatically. **No attachments** — the order field is text
  only; `HARNESS_LAUF_STARTEN`'s `anhaenge` parameter exists for the standalone Harness
  window, the grid cell offers no picker for it. **No "Fortsetzen" button** — the cell
  only ever continues a dormant run automatically, as a side effect of sending a new
  order that fits the remaining budget; there is no control to resume an arbitrary past
  run by picking it, the way `HARNESS_LAUF_FORTSETZEN` lets the Harness window do.
  (An earlier NanoClaw bridge served the level-B role until it was superseded on
  2026-08-16 and removed 2026-08-17; see
  [`docs/anpassbare-flaechen.md`](docs/anpassbare-flaechen.md) for why.)
- **Codex and Gemini adapters** remain a design target, untouched.
- **What the network stretch still loses is content, not connectivity.** Pages behind an
  HTTP 403 for clients without a browser identity (Reddit, Stack Exchange) stay unread on
  purpose — the platforms decide how their data is released, and keel does not spoof a
  user agent to get around that. Pages that Readability cannot extract because they render
  in JavaScript (GitHub issues among them) are the open half of that problem.
- **Level C** is a 0.2 target and untouched.

## Install

Build a DMG from this branch with `npm run dist` — it produces
`release/cipher keel-0.1.0-arm64.dmg` — or, once one has been published, download the
same artefact from the
[latest release](https://github.com/cmarkus42-rgb/cipher-keel-electron/releases/latest).
Open the DMG and drag the app to `/Applications`.

**The build is not code-signed.** macOS will refuse to open it until you clear the
quarantine attribute — once, after installing:

```bash
xattr -cr "/Applications/cipher keel.app"
```

Without this you get *"cipher keel is damaged and can't be opened"*, which is macOS
being terse about a missing signature, not a corrupted download.

### Requirements

- **Apple Silicon Mac** (arm64). There is no Intel build: the native modules ship as
  arm64 binaries, and an x86_64 package would fail at startup rather than degrade
- **macOS 12 or later** (Electron 42 floor)
- **tmux** — `brew install tmux`. Without it, sessions cannot start; the status bar
  says so
- **[Claude Code CLI](https://claude.com/claude-code)** — required to do anything useful
  in a session; the app launches it itself, with the entity's assembled system prompt
  appended. Without it on PATH, `session:create` refuses to start and returns an error
  naming the missing binary, instead of opening a dead shell. The status bar reports
  whether the app can find it on the usual paths (`/opt/homebrew/bin`, `~/.local/bin`,
  `~/.claude/local`), even when launched from Finder

Everything else — the knowledge graph, notes, kanban — works without those two.

## Repository layout

```
src/main/          — Electron main process
  graph/           — Knowledge graph: schema, search (FTS5 + vec + RRF), MCP server,
                     vault sync, phase contract, gate cache, maintenance
  preset/          — Entities: systems-engineer, architect, cyber-factory,
                     testing-assistant, workshop, capability tree, level (niveau) logic
  p1/              — Handover documents: frontmatter schema, body templates,
                     REQ-ID schema, normaliser, versioning
  github/          — gh CLI auth, repo creation, keychain token store, MCP config
  tmux/            — TmuxManager, control-mode parser, output batcher
  session/         — Entity assembly, orchestrator template, keep-working snapshots
  notes/           — Note manager, tagging, Obsidian compatibility, vault watcher
  voice/           — Whisper STT, Piper and macOS TTS, VAD routing
  kanban/          — Board store, one-directional Kanban → graph sync
  monitoring/      — Statusline monitor and hook
  model/           — Model registry, capability records, tier/role slots, endpoint
                     resolution, price table
  worker/          — Transports: Ollama, OpenAI-compatible, Anthropic; keychain API keys
  harness/         — keel's own agent loop: prompt assembly, codecs, budgets, event log,
                     tools (file, graph, net), netwatch, page extraction, researcher
src/renderer/      — React 19 UI: SessionGrid, ProjectView, Timeline, KanbanBoard,
                     KickoffWizard, NotesCell, settings tabs
src/shared/        — Typed IPC channels and domain types
src/preload.ts     — contextBridge API (window.cipherKeel)
tests/             — 2760 Vitest tests
docs/superpowers/  — Implementation plans, design specs and audit reports per phase
```

## Development

**Requirements:** macOS, Node.js 22 (pinned in [`.nvmrc`](.nvmrc) — the lockfile is
npm-major-sensitive, see [`CONTRIBUTING.md`](CONTRIBUTING.md)), tmux, and a working
Claude Code CLI for live sessions.

```bash
git clone https://github.com/cmarkus42-rgb/cipher-keel-electron.git
cd cipher-keel-electron
npm ci
npm run rebuild-native   # required to actually run the app — see below
npm run dev
```

`better-sqlite3` is a native Node addon and has to exist as two separate builds: one
compiled against Electron's ABI (used when the app runs) and one against Node's ABI
(used by Vitest). `npm run rebuild-native` produces the Electron-ABI build and then
restores the Node-ABI one, in that order — it is deliberately two chained commands, and
running only one of them leaves the other build broken. Skip this step and the tests
still pass (they only exercise the Node-ABI side), while the app's knowledge graph
silently fails to load. Re-run it after every dependency install and every Electron
upgrade. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full explanation and the
other setup traps (Node version pinning, the `xterm` peer-dependency override).

| Command | Purpose |
|---------|---------|
| `npm run dev` | electron-vite dev server with HMR |
| `npm run build` | Production build |
| `npm start` | Launch Electron (after build) |
| `npm run rebuild-native` | Rebuild `better-sqlite3` for Electron's ABI, then restore the Node-ABI build |
| `npm test` | Vitest suite |
| `npm run typecheck` | TypeScript check (`tsc -b`), no emit |
| `npm run lint` | ESLint |

**Stack:** Electron 42, React 19, TypeScript (strict), Vite / electron-vite, xterm.js
(WebGL with canvas fallback), better-sqlite3 (WAL), sqlite-vec, Vitest.

The renderer is sandboxed: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. All main-process access goes through the `window.cipherKeel` contextBridge API.

## Relationship to cipher-mux

cipher keel is not an in-place upgrade of cipher-mux 0.9.x. It is a separate Electron
project, built *alongside* the running one — and built *with* it. cipher-mux stays the
dogfooding tool until cipher keel can carry itself.

The rule is reuse over rebuild. Ported: tmux backend, agent adapter, statusline monitor,
config store, voice pipeline, notes system, `injectSection` mechanics. Rebuilt: workspaces
became project-centric organisation, the message bus became the knowledge graph, and the
setup dialog became the deterministic kickoff wizard.

## Design decisions

Fourteen ratified decisions (D1–D14) from the concept round govern the architecture —
among them the merge of the tool layer into one module, the "deeper 0.1" release cut that
ships the channel skill from day one, Unix domain sockets as the channel IPC, cost
visibility as a sub-component rather than its own subsystem, and the three cross-cutting
rules described above (rolling summary, C-only not recommended, level service).

Implementation plans, design specs and audit reports per phase live in `docs/superpowers/`.
`HANDOFF.md` documents the completed build waves with their requirement IDs.

## Scope boundaries

- Not a commercial product — an open-source project built out of personal need
- Not a replacement for the Claude Code CLI — an orchestration layer on top of it
- Not a way to stretch or work around provider quotas — leg 1 runs the vendor's own CLI
  under the vendor's own terms, and leg 2 (the API and multi-model path) uses provider keys
  you bring yourself
- Not a magic wand for vague ideas — being able to state a precise specification stays essential
- Single-developer project; expect the pace and the gaps that come with that

## License

[MIT](LICENSE) · Copyright (c) 2026 Christian Markus
