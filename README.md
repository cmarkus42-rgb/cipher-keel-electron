# cipher keel

**A tmux multiplexer around official coding CLIs, with a knowledge graph as its substrate.**

<p>
  <img alt="Status" src="https://img.shields.io/badge/status-pre--alpha-orange?style=flat-square&labelColor=000000">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square&labelColor=000000">
  <img alt="Tests" src="https://img.shields.io/badge/tests-1390%20passing-brightgreen?style=flat-square&labelColor=000000">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square&labelColor=000000">
</p>

> **Pre-alpha — source only.** The modules, architecture and test suite exist and are green.
> There is no packaged build, no release, and no end-to-end click-through UX yet. Read this
> repository as a working system under construction, not as a product you can install.
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

**Leg 2** is NanoClaw as a peer runtime for the API and multi-model path (Ollama, OpenAI,
DeepSeek). It is connected through a channel skill over a Unix domain socket with
JSON-Lines framing — local trust, no port management, bidirectional.

The two legs run *next to* each other, not inside each other. Cross-runtime orchestration
— one leg spawning a sub-session on the other — is explicitly deferred to a later version.
Deciding this up front is what keeps v1 buildable.

### 2. Three tool levels (A / B / C)

Every preset runs at one of three levels, which describes how much of the harness it can rely on:

| Level | Name | Target harness | Capability depth |
|-------|------|----------------|------------------|
| **A** | Full | Claude Code (CLAUDE.md, skills, MCP) | Full capability palette |
| **B** | Portable | NanoClaw path, OpenCode, Codex, Gemini | Core capabilities, API-compatible |
| **C** | Minimal | "Configured folder" for pi and local models | Basic structure, assistive mode |

Level C is usable as a structured thinking partner, but is deliberately **not** recommended
as a full realisation of a role. Level B is the recommended minimum for a role to actually
carry its own weight.

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

Seven document types carry the output between phases, each with a default addressee that
frontmatter can override: requirements → refinement, spec → architect, architecture package →
cyber factory, build package → testing, test findings → fixing, fix report → audit,
audit summary → release management. Nine REQ-ID prefixes (`SA`, `REQ`, `NFR`, `BUG`, `MFR`,
`NRF`, `C`, `M`, `N`) are each bound to the phase that may assign them.

### 6. Four entities

| Preset | Role |
|--------|------|
| **Systems Engineer** | Project leadership and gate verdicts. Splits into a lead SE and sub-project SEs when a system is decomposed |
| **Architect** | Long-running companion: worker supervision, interface coaching, wave coordination |
| **Cyber Factory** | Lean build master, coordinates worker sessions in parallel |
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

All 1390 tests pass across 93 test files (`npm test`, ~5s).

| Phase | Content | Status |
|-------|---------|--------|
| BT-1a | Knowledge graph foundation — schema, node/edge types, writer | Done |
| BT-1bc | MCP tools, Obsidian vault integration, chunking and embeddings | Done |
| BT-2b | NanoClaw bridge and channel adapter | Done |
| BT-3d | Voice pipeline (Whisper STT, Piper/macOS TTS) and notes system | Done |
| Wave 4 | Graph wired into the Electron main process, NFR checks | Done |
| Phase 3a | Process completion — phase contract, gates, subsystem cycle | Done, audited |
| Phase 3b | GitHub integration and kickoff wizard | Done, audited |
| Phase 3c | Systems Engineer preset, entity assembly | Done, audited |
| Phase 4 | Architect and Cyber Factory presets | Done, audited |
| Phase 5 | Stabilisation — Kanban, session snapshots, vault validator, status bar | Done, audited |

The last five phases each ended in a formal audit with a RELEASE verdict; findings are
recorded in `docs/superpowers/specs/`.

### What is not there yet

- **No packaged build.** `electron-builder` is configured for a macOS DMG, but no release
  has been produced. Run from source
- **No end-to-end UX flow.** The main window is a session grid; the project window with
  timeline and Kanban is a second window. The components exist and are tested, but they
  are not yet joined into one continuous path from kickoff to shipped code
- **macOS only.** tmux plus Unix domain sockets plus keychain. Linux is plausible, Windows is not planned
- **Idle RAM budget unverified.** The <300 MB target is architecturally supported
  (lazy init, WAL, no in-memory cache) but has not been measured in a running Electron process
- **Codex and Gemini adapters** are a design target, not implemented
- **No CI.** Tests run locally

## Repository layout

```
src/main/          — Electron main process
  graph/           — Knowledge graph: schema, search (FTS5 + vec + RRF), MCP server,
                     vault sync, phase contract, gate cache, maintenance
  preset/          — Entities: systems-engineer, architect, cyber-factory, workshop,
                     capability tree, level (niveau) logic
  p1/              — Handover documents: frontmatter schema, body templates,
                     REQ-ID schema, normaliser, versioning
  github/          — gh CLI auth, repo creation, keychain token store, MCP config
  nanoclaw/        — Peer-runtime bridge, channel adapter, container env
  tmux/            — TmuxManager, control-mode parser, output batcher
  session/         — Entity assembly, orchestrator template, keep-working snapshots
  notes/           — Note manager, tagging, Obsidian compatibility, vault watcher
  voice/           — Whisper STT, Piper and macOS TTS, VAD routing
  kanban/          — Board store, one-directional Kanban → graph sync
  monitoring/      — Statusline monitor and hook
src/renderer/      — React 19 UI: SessionGrid, ProjectView, Timeline, KanbanBoard,
                     KickoffWizard, NotesCell
src/shared/        — Typed IPC channels and domain types
src/preload.ts     — contextBridge API (window.cipherKeel)
tests/             — 1390 Vitest tests
docs/superpowers/  — Implementation plans, design specs and audit reports per phase
```

## Development

**Requirements:** macOS, Node.js 20+, tmux, and a working Claude Code CLI for live sessions.

```bash
git clone https://github.com/cmarkus42-rgb/cipher-keel-electron.git
cd cipher-keel-electron
npm install
npx electron-rebuild   # required — see below
npm run dev
```

`better-sqlite3` is a native Node addon and must be compiled against the Electron version
in use. Without `npx electron-rebuild` after `npm install` you get a `NODE_MODULE_VERSION`
mismatch at startup. Re-run it after every `npm install` and every Electron upgrade.

| Command | Purpose |
|---------|---------|
| `npm run dev` | electron-vite dev server with HMR |
| `npm run build` | Production build |
| `npm start` | Launch Electron (after build) |
| `npm test` | Vitest suite |
| `npm run typecheck` | TypeScript check, no emit |
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
- Not a magic wand for vague ideas — being able to state a precise specification stays essential
- Single-developer project; expect the pace and the gaps that come with that

## License

[MIT](LICENSE) · Copyright (c) 2026 Christian Markus
