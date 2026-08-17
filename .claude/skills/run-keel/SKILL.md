---
name: run-keel
description: Launch and drive the cipher keel Electron app to check that a change actually works in the running application. Use this whenever you need to start, run, or screenshot the app, verify an IPC handler end to end, reproduce a UI bug, confirm a subsystem initializes, or prove an acceptance criterion — and especially before claiming a change works, since this repo's test suite cannot reach an ipcMain handler and green tests say nothing about the wiring.
---

# Running cipher keel

cipher keel is an Electron app with three windows. Almost everything interesting happens
behind IPC (`window.cipherKeel.invoke(...)`), and **no test in this repo reaches an
`ipcMain` handler** — there is no electron mock, and vitest runs under plain Node. The
suite can be entirely green while the app is broken. That actually happened: the
knowledge graph failed to load in the real app for weeks because `better-sqlite3` was
built for Node's ABI, while 1390 tests passed because they run under Node.

So when a change needs to be *believed*, drive the real app.

All paths below are relative to this skill's directory.

## Run it

```bash
.claude/skills/run-keel/launch.sh            # builds, launches, waits until drivable
node .claude/skills/run-keel/driver.mjs --list
.claude/skills/run-keel/stop.sh              # kills the app AND its tmux sessions
```

`launch.sh` uses a throwaway profile (`/tmp/keel-verify` by default) so the real
profile stays untouched and "fresh start" behaviour is reproducible. Pass a different
path as the first argument if you need two profiles in one session.

**Always finish with `stop.sh`.** The app creates real tmux sessions; leaving them
behind pollutes the machine and corrupts the next run's `tmux list-sessions` check.

## Drive it

```bash
node .claude/skills/run-keel/driver.mjs <urlPart> '<js expression>'
```

`<urlPart>` picks the window: `project-window` for the project window (project list,
kickoff wizard, ProjectView with Timeline + Kanban), `index.html` for the grid window
(SessionGrid, StatusBar), `settings-window` for the settings window (model registry,
assignments, CLI start parameters, speech output).

The settings window does not open on start. Open it first, then drive it:

    node $D project-window "window.cipherKeel.invoke('window:open-settings')"
    node $D settings-window "window.cipherKeel.invoke('settings:ansicht')"

The expression is evaluated with `awaitPromise`, so an
`invoke(...)` promise can be passed directly and its resolved value is printed as JSON.

```bash
D=".claude/skills/run-keel/driver.mjs"

# Which subsystems are up, and why not?
node $D project-window "window.cipherKeel.invoke('services:status')"

# Full kickoff: project record, git init, eight-phase chain
node $D project-window "window.cipherKeel.invoke('project:kickoff',
  {name:'Probe',rootPath:'/tmp/probe',initGit:true,github:{action:'skip'}})"

# What does the user actually see?
node $D index.html "document.body.innerText"
```

## Prove it through the UI, not around it

Reaching a feature by invoking its IPC channel proves the handler works — which is
usually not the question. The question is whether a *user* can get there. Phase 6 shipped
a grid window that no button, menu or shortcut could open; every IPC-driven check passed
anyway.

So click through the DOM. A DOM `.click()` runs the same React handler chain a mouse
would:

```bash
node $D project-window "
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Grid oeffnen'))?.click() ?? 'NOT FOUND'"
```

Then confirm the *consequence* — a new window in `--list`, a row in the database, a
tmux session — rather than trusting that the click did something.

## Verifying a failure path

A healthy run only proves the happy path. To see degradation, break a subsystem on
purpose. The graph is the easiest: rename the ABI-specific addon directory so it cannot
load.

```bash
B=node_modules/better-sqlite3/bin/darwin-arm64-146
mv "$B" "$B.off"     # …run your check…
mv "$B.off" "$B"     # RESTORE — the app cannot open its database without this
```

Restore it before you finish, and verify the directory is back. Forgetting leaves the
repo in a state where the graph silently degrades and the cause is not obvious.

Reproducing a bug on the *pre-fix* build and then showing it gone afterwards is worth
far more than only showing the fixed state. It rules out "the check never exercised the
path".

## Report honestly

You cannot see the window. Screenshots are not available through this driver, so a claim
about visual appearance is not something you can make — read `innerText`, the DOM, or the
log, and say which. A check you skipped and reported plainly is fine; a check you claimed
and did not run is not.

## Gotchas

- **Stale instance holds the port.** `launch.sh` kills one first. If you launch by hand
  and skip that, you will silently drive the previous app.
- **Service init is deferred** behind `setImmediate` so the window paints first. Querying
  immediately returns a misleading all-degraded snapshot; `launch.sh` waits
  (`KEEL_INIT_WAIT`, default 9s).
- **`voice` legitimately reports `degraded`** on a normal dev machine — no Whisper model.
  That is expected, not a failure. It should be the *only* degraded subsystem: the
  NanoClaw subsystem was removed on 2026-08-17 (superseded by keel's own harness), so
  there is no `nanoclaw` subsystem id left to expect. `tmux`, `graph`, `kanban` and
  `notes` should be `ready`.
- **`window.cipherKeel` is frozen by contextBridge.** You cannot monkey-patch it to
  inject failures; break the underlying subsystem instead (see above).
- **Cross-window events** need listeners registered in both windows before you trigger
  anything: `window.__ev=[]; window.cipherKeel.on('notes:changed',()=>window.__ev.push(1))`,
  then read `window.__ev` in each.
