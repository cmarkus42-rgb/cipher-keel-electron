/**
 * ipc-handlers.ts — all IPC handler registrations for the main process.
 *
 * registerIpcHandlers(services) must be called once in app.whenReady().
 *
 * CK-INF-009
 */

import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileAsync } from './util/exec-util'
import {
  checkAuthStatus,
  getToken,
  triggerLogin,
  createRepo,
  linkRepo,
  listUserRepos,
  storePat,
  switchRepo,
} from './github'
import {
  SESSION_LIST,
  SESSION_CREATE,
  SESSION_DESTROY,
  SESSION_AUFTRAG,
  SESSION_STATUS_CHANGED,
  PRESET_PREVIEW_PROMPT,
  TERMINAL_DATA_OUTBOUND,
  TERMINAL_RESIZE,
  GRAPH_SEARCH,
  GRAPH_READ,
  GRAPH_WRITE,
  GRAPH_QUERY,
  GRAPH_LINK,
  GRAPH_DELETE,
  GRAPH_EXPAND,
  GRAPH_MAINTAIN,
  CONFIG_GET,
  CONFIG_SET,
  VOICE_AVAILABLE,
  VOICE_START_SESSION,
  VOICE_STOP_SESSION,
  VOICE_SET_SESSION_TARGET,
  VOICE_SET_ROUTING_MODE,
  VOICE_VAD_SPEECH_START,
  VOICE_VAD_SPEECH_END,
  VOICE_VAD_MISFIRE,
  VOICE_BARGE_IN,
  VOICE_PIN_SESSION,
  NOTES_LIST,
  NOTES_CREATE,
  NOTES_READ,
  NOTES_SAVE,
  NOTES_DELETE,
  NOTES_TRASH,
  NOTES_TRASH_MANY,
  NOTES_RESTORE_MANY,
  NOTES_SEARCH,
  NOTES_TAGS,
  NOTES_AUTO_TAG,
  NOTES_TAG_INDEX,
  NOTES_SAVE_RAW,
  NOTES_VALIDATION_WARNING,
  PROJECT_LIST,
  PROJECT_CREATE,
  PROJECT_SWITCH,
  PROJECT_GET_CURRENT,
  WINDOW_OPEN_GRID,
  WINDOW_OPEN_SETTINGS,
  WINDOW_OPEN_HARNESS,
  KANBAN_LIST,
  KANBAN_CREATE,
  KANBAN_UPDATE,
  KANBAN_DELETE,
  KANBAN_HYGIENE,
  KANBAN_CHANGED,
  P1_NORMALIZE,
  GITHUB_CHECK_AUTH,
  GITHUB_GET_TOKEN,
  GITHUB_TRIGGER_LOGIN,
  GITHUB_CREATE_REPO,
  GITHUB_LINK_REPO,
  GITHUB_LIST_REPOS,
  GITHUB_STORE_PAT,
  GITHUB_SWITCH_REPO,
  GRAPH_INIT_PROJECT,
  GIT_HAS_REPO,
  DIALOG_OPEN_DIR,
  PROJECT_KICKOFF,
  SERVICES_STATUS,
} from '../shared/ipc-channels'
import { getServiceStatus } from './service-lifecycle'
import { buildSessionContext, writeSessionNode } from './session/session-context'
import { subsystemError } from '../shared/service-status'
import { isKnownPresetId, defaultPresetId } from '../shared/preset-catalog'
import { initProjectPhases, runKickoff, activateAfterKickoff } from './project/kickoff'
import type { KickoffPayload } from './project/kickoff'
import { configStore } from './config/config-store'
import type { CipherKeelConfig } from './config/config-store'
import { graphSearch, graphGetNode, graphExpand } from './graph/search'
import type { SearchParams, ExpandParams } from './graph/search'
import { graphQuery } from './graph/query'
import { graphMaintain } from './graph/maintain'
import type { GraphWriter } from './graph/writer'
import { ProjectManager } from './project/project-manager'
import type { CreateKanbanItemInput, UpdateKanbanItemInput } from '../shared/kanban-types'
import { createMainWindow, createSettingsWindow, createHarnessWindow } from './window-manager'
import type { AppServices } from './window-manager'
import { registerSettingsHandlers } from './settings/handlers'
import { registerHarnessHandlers } from './harness-handlers'
import { registerWindow, broadcast } from './event-bus'
import { normalizeToP1Format } from './p1/normalizer'
import { getEntityDefinition, getEntityRahmen } from './preset/registry'
import { resolveModel, tierAus } from './session/model-resolver'
import { cliHandleFuerTier, eintragFuerSitzung } from './model/registry'
import { getGlobalRules } from './preset/global-rules'
import { getCapabilityPackages } from './preset/capabilities'
import { CapabilityNiveau } from './preset/niveau'
import { buildPromptPreview } from './session/preview-prompt'
import { buildPhaseInputSection } from './session/phase-input'
import { assembleEntityClaudeMd } from './session/assemble-entity'
import { materialiseCapabilities } from './session/materialise-capabilities'
import { writeEntityPromptFile, removeEntityPromptFile } from './session/prompt-file'
import { formatShellCommand, splitShellArgs } from './util/shell-quote'
import { AdapterRegistry } from './agent/registry'
import { istSchleifenAdapter, SITZUNG_EIGENE_SCHLEIFE, type EntitaetsTeile } from './agent/agent-adapter'
import { neuesRegister, type SchleifenZelle } from './session/schleifen-sitzungen'
import { baueSchleifenSitzung } from './session/schleifen-start'
import { beauftrageZelle } from './session/schleifen-auftrag'
import { harnessDb } from './harness-sitzung'
import { lesen } from './harness'
import type { SessionStatusChanged } from '../shared/harness-types'

// Tracks the active grid window for focus-or-create logic (CK-UI-002)
let activeGridWindow: BrowserWindow | null = null
// Tracks the active settings window for focus-or-create logic
let activeSettingsWindow: BrowserWindow | null = null
// Tracks the active harness window for focus-or-create logic
let activeHarnessWindow: BrowserWindow | null = null

export function registerIpcHandlers(services: AppServices): void {
  // The grid cells of keel's own loop (SchleifenSitzungsAdapter). Function-scoped rather than
  // module-level (this function runs once, per its own doc comment above) — and published onto
  // `services` right after construction so `initGraph` (service-lifecycle.ts), which runs later
  // and builds GraphMcpServer, can hand the SAME instance to the `keel_zellen`/
  // `keel_zelle_beauftragen`/`keel_zelle_ergebnis` tools. One Zusammenbau, two Verbraucher —
  // see the doc comment on AppServices.schleifenZellen (window-manager.ts) for the ordering
  // argument (registerIpcHandlers always runs before initializeServices in main.ts).
  const schleifenZellen = neuesRegister()
  services.schleifenZellen = schleifenZellen
  /**
   * The prefix parts per cell, taken from the entity definition. Kept separate from the
   * register because they never reach the renderer: it sees events, never a provider, never
   * an endpoint, never a capability row (shared/harness-types.ts) — and a prompt body or
   * persona is exactly that kind of content.
   */
  const praefixJeZelle = new Map<string, EntitaetsTeile>()
  services.praefixJeZelle = praefixJeZelle

  // The registry demands its config reader — see Task 6. This is the one place that has
  // both Electron and the ConfigStore loaded, which is why the reading happens here and
  // not inside the adapter.
  const adapterRegistry = new AdapterRegistry({
    getStartArgs: (adapterId: string) =>
      splitShellArgs(configStore.get('agent').startArgs[adapterId] ?? ''),
  }, services)
  // Same publication as schleifenZellen above, same reason: GraphMcpServer's
  // keel_zelle_beauftragen needs the keel-harness adapter's starteAuftrag. Two other places
  // also build an AdapterRegistry (settings/handlers.ts, model/ansicht.ts) — but both pass no
  // `services`, so their keel-harness adapter can list itself and nothing more. This is the
  // only long-lived registry whose keel-harness adapter actually carries the real services and
  // can run starteAuftrag, which is what keel_zelle_beauftragen needs.
  services.adapterRegistry = adapterRegistry

  // Project manager — wired to configStore for persistence (CK-INF-020)
  const projectManager = new ProjectManager(
    (data) => configStore.set('projects', data),
    () => configStore.get('projects'),
  )

  // ---------------------------------------------------------------------------
  // Session handlers (tmux backend — CK-INF-002)
  // ---------------------------------------------------------------------------

  ipcMain.handle(SESSION_LIST, async () => {
    return services.tmux.listSessions()
  })

  ipcMain.handle(SESSION_CREATE, async (_event, opts: {
    name?: string
    entityId?: string
    cwd?: string
    env?: Record<string, string>
    width?: number
    height?: number
  }) => {
    try {
      const project = projectManager.getCurrentProject()
      const entityId = opts.entityId && isKnownPresetId(opts.entityId)
        ? opts.entityId
        : defaultPresetId()

      // Derive name and cwd from the active project unless the caller pinned them.
      let name = opts.name
      let cwd = opts.cwd
      let ctx = null
      if (project) {
        const seed = Math.random().toString(36).slice(2, 6)
        ctx = buildSessionContext(project, entityId, seed)
        name = name ?? ctx.name
        cwd = cwd ?? ctx.cwd
      }
      if (!name) {
        return { id: null, name: null, error: 'No session name and no active project' }
      }

      // Assemble the entity prompt. The IPC surface takes no caller-supplied command —
      // it never had a real user, and a generic untyped `invoke` bridge means nothing
      // stops the renderer from injecting raw keystrokes through such a field. The
      // composition always runs once a project directory is known.
      if (!cwd) {
        return { id: null, name: null, error: 'No project directory (cwd) — cannot start the entity' }
      }

      // Two-step resolution: the Rahmen carries `runtime`, the adapter carries the
      // niveau, and the full definition depends on the niveau (M2 sections 11.3/11.4).
      const rahmen = getEntityRahmen(entityId)
      if (!rahmen) {
        return { id: null, name: null, error: `Unknown entity '${entityId}'` }
      }

      // An unknown runtime throws rather than falling back — a silent fallback would
      // start a Claude session for an entity that asked for something else.
      let adapter
      try {
        adapter = adapterRegistry.getForRuntime(rahmen.runtime)
      } catch (err) {
        return { id: null, name: null, error: (err as Error).message }
      }

      // Gate before any file is written: a launch that fails here leaves no
      // orphaned prompt file and no rewritten .claude/capabilities/ tree behind.
      if (!adapter.isAvailable()) {
        return {
          id: null,
          name: null,
          // The adapter knows why it is unavailable; the fallback only fires if an
          // adapter reports unavailable and stays silent about why, which would be a
          // contract violation on its side, not a case this handler should invent text for.
          error: adapter.nichtVerfuegbarGrund() ??
            `Adapter '${adapter.displayName}' ist nicht verfuegbar — Sitzung nicht gestartet`,
        }
      }

      // The niveau comes from the harness that will actually run this session, not from
      // a default. Every session was Niveau A before this, whatever its adapter could do.
      const def = getEntityDefinition(entityId, adapter.niveau)
      if (!def) {
        return { id: null, name: null, error: `Unknown entity '${entityId}'` }
      }

      // From here the two Sitzungsarten fork — but less far than an earlier draft of this
      // plan claimed. materialiseCapabilities runs on BOTH paths: it writes to
      // `<project>/.claude/capabilities/`, and that is exactly what `leseFaehigkeiten`
      // (WURZELN = ['skills', 'capabilities'] in harness/faehigkeiten.ts), keel's own
      // loop's capability reader, reads from. The consumer that draft thought did not
      // exist is the loop itself: its capabilities reach the model through the harness's
      // own lazy loading — a name/description stub in the stable prefix, the body on
      // demand via `faehigkeit_lesen` — instead of the full text in a cached prefix.
      //
      // What genuinely drops on the loop path: `writeEntityPromptFile` (the body enters
      // via `assemblePraefixTeile`, not a file plus a command-line flag) and the whole
      // pane, `buildLaunchCommand` included.
      //
      // Order matters here, and it is the same "gate before any file is written" rule as
      // isAvailable() above, one step later: baueSchleifenSitzung runs FIRST, purely, and
      // returns before materialiseCapabilities ever touches disk if the sitzung:niveau-b
      // slot is empty. Only once that gate is past does the (single) materialiseCapabilities
      // call below run — shared by both Sitzungsarten rather than written out twice, so the
      // two copies cannot drift the way two hand-written copies of the same call would.
      let schleifenTeile: { zelle: SchleifenZelle; praefix: EntitaetsTeile } | null = null
      if (istSchleifenAdapter(adapter)) {
        const gebaut = baueSchleifenSitzung({
          name, cwd, entityId, def, eintrag: eintragFuerSitzung('niveau-b'),
        })
        if (!gebaut.ok) return { id: null, name: null, error: gebaut.meldung }
        schleifenTeile = { zelle: gebaut.zelle, praefix: gebaut.praefix }
      }

      const materialised = materialiseCapabilities(def.rahmen.capabilityAnbindung, cwd)
      if (materialised.unknown.length > 0) {
        console.warn(
          `[ipc] entity '${entityId}': no SKILL.md asset for ${materialised.unknown.join(', ')}`
        )
      }

      if (schleifenTeile) {
        schleifenZellen.setze(schleifenTeile.zelle)
        praefixJeZelle.set(name, schleifenTeile.praefix)

        if (ctx && services.graphWriter) {
          try {
            writeSessionNode(services.graphWriter, { ...ctx, name })
          } catch (err) {
            console.warn('[ipc] session node write failed:', err)
          }
        }
        // Deliberately the imported constant here, not its own string value written out —
        // laeuferHeimat (tests/model/eignung-einzige-quelle.test.ts) only allows that
        // Laeufer literal in eignung.ts, slots.ts and agent-adapter.ts.
        //
        // eintragId ist der Registry-Eintrag, den baueSchleifenSitzung aus dem
        // 'sitzung:niveau-b'-Zuordnungsplatz aufgeloest und in die Zelle geschrieben hat (siehe
        // SchleifenZelle in schleifen-sitzungen.ts) — nicht der Platz selbst. Der Renderer zeigt
        // damit im Zellenkopf, was diese Zelle tatsaechlich faehrt, auch wenn der Platz spaeter
        // umbelegt wird: 'naechste-session' (model/slots.ts) heisst, die naechste NEUE Zelle
        // bekommt die Aenderung, diese hier nicht mehr.
        return {
          id: name, name, error: null, sitzungsart: SITZUNG_EIGENE_SCHLEIFE,
          eintragId: schleifenTeile.zelle.eintragId, hinweis: null,
        }
      }

      // istSchleifenAdapter(adapter) already returned above for every loop adapter that
      // reaches this line (see schleifenTeile) — this re-states that for the type checker,
      // which cannot follow the narrowing through the intervening materialiseCapabilities
      // call and the `schleifenTeile` check. Also a real safety net, not just a cast: if
      // that invariant ever breaks, this throws instead of handing a loop adapter to
      // buildLaunchCommand, a method it does not implement.
      if (istSchleifenAdapter(adapter)) {
        throw new Error('[ipc] unreachable: Schleifen-Adapter erreichte den Fremdes-CLI-Pfad')
      }

      const prompt = assembleEntityClaudeMd({
        body: def.body,
        persona: def.persona ?? undefined,
        globalRules: getGlobalRules(def.rahmen.capabilityNiveau),
        niveau: def.rahmen.capabilityNiveau,
        capabilities: materialised.written,
        capabilityPackages: getCapabilityPackages(entityId, def.rahmen.capabilityNiveau),
        // The fifth layer (M2 sections 9.1/17.4): where in the process this entity stands.
        // Resolved from the graph, so a degraded graph costs the layer, not the session.
        phaseInput: await buildPhaseInputSection(services.graphDb, def.rahmen.phasenBindung),
      })
      const promptPath = writeEntityPromptFile(app.getPath('userData'), name, prompt)

      // The Rahmen's model is a tier label (Schenkel 1) or a provider:model handle
      // (Schenkel 2, M2 section 6.3). Unresolvable values omit --model, which is what
      // every session did before the tier table existed.
      //
      // Resolved once outside resolveModel's own lookup call (same reasoning as
      // preview-prompt.ts) so a wrong-shaped tier assignment warns exactly once, and so
      // the reason it fell back to agent.modelTiers is available for the result below.
      const tier = tierAus(def.rahmen.model)
      const cliErgebnis = tier ? cliHandleFuerTier(tier) : undefined
      const model = resolveModel(
        def.rahmen.model,
        configStore.get('agent').modelTiers,
        () => cliErgebnis?.handle
      )

      const launch = adapter.buildLaunchCommand({
        projectPath: cwd,
        sessionName: name,
        appendSystemPromptFile: promptPath,
        model,
      })
      const command = formatShellCommand(launch.cmd, launch.args)

      // Ahead of the injection below, not between it and createSession, where it stood until
      // the follow-up review of 4358cac: connect() is the likeliest tmux failure there is (no
      // tmux server running, tmux not installed), and from between the two it would have
      // thrown past every rollback path — a live bearer left in settings.local.json with no
      // note to the user that it is there. Ordered this way, no key is written at all while
      // tmux is unreachable: the gap closes constructively instead of through a second undo
      // path. The rollback around createSession below still covers the window that remains.
      if (!services.tmux.isConnected()) {
        await services.tmux.connect()
      }

      // B4 (MCP transport, Paket B), run BEFORE tmux.createSession — security review
      // finding I-1 (2026-08-30): postLaunchInjection reads none of AdapterContext's fields
      // from a live tmux session (see the doc comment on postLaunchInjection and on
      // AdapterContext.sessionId), so running it after createSession was a race against the
      // very `claude` process it configures — createSession's own send-keys spawns that
      // process roughly 500ms after the pane opens, and `claude` reads its MCP config once,
      // at its own start. The `settings.local.json` write usually wins that race by luck of
      // timing; the `claude mcp add-json` CLI round-trip (up to 25s) reliably loses it.
      // Running injection first removes the race rather than narrowing it: nothing below
      // depends on the tmux session existing yet. postLaunchInjection is optional on
      // CliSitzungsAdapter and absent entirely from SchleifenSitzungsAdapter (this branch
      // cannot reach a loop adapter — see the `istSchleifenAdapter` guard above), so the
      // `adapter.postLaunchInjection` check below is the real gate, not defensive dressing.
      // Nothing here is swallowed silently: a missing MCP server is exactly the case named
      // in mcp-http-server.ts's header comment (graph degraded), and a rejected injection
      // still leaves the session usable via tmux — just without the ten tools — so neither
      // failure mode should abort session creation; both are logged AND surfaced to the
      // renderer via `hinweis` below (a session that silently has no tools is exactly the
      // "looks healthy, isn't" case this file's `isAvailable()` gate already argues against
      // for the CLI-missing case).
      let mcpHinweis: string | null = null
      // Set only once postLaunchInjection has resolved without throwing — see the doc
      // comment on its call below for what a non-null value does and does not guarantee.
      // Non-null says "there is something to take back", never "taking it back worked":
      // that second question is what the closure's boolean answers.
      let undoInjection: (() => boolean) | null = null
      if (services.mcpHttpServer && adapter.postLaunchInjection) {
        try {
          undoInjection = await adapter.postLaunchInjection({
            projectPath: cwd,
            mcpUrl: services.mcpHttpServer.url,
            mcpApiKey: services.mcpHttpServer.apiKey,
            // Not a live session id — see the doc comment on AdapterContext.sessionId. This
            // runs before tmux.createSession would hand us one, and the sole implementation
            // does not read this field anyway.
            sessionId: name,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          mcpHinweis = `MCP-Registrierung fehlgeschlagen: ${msg}`
          console.warn('[ipc] postLaunchInjection failed:', err)
        }
      } else if (!services.mcpHttpServer) {
        mcpHinweis = 'MCP-Registrierung uebersprungen: HTTP-Server nicht verfuegbar.'
        console.warn(
          `[ipc] session '${name}': MCP HTTP server not available — session started ` +
          'without MCP registration (the ten tools will not be reachable from it)'
        )
      }

      // I-1 follow-up (security review, 2026-08-30): moving postLaunchInjection ahead of
      // createSession closed the race against the CLI's own config read, but opened a
      // narrower gap — if createSession now fails, a live bearer key can be left behind in
      // settings.local.json for a session that never came to exist. The order is
      // connect -> injection -> createSession (see the connect block above for why connect
      // moved out from between the last two), so this rollback covers exactly the
      // createSession window that is left. `undoInjection` (see its doc comment on
      // ClaudeCodeAdapter.postLaunchInjection) reverts exactly what path 1 wrote, never a
      // blind wipe, and REPORTS whether it got there — the residual note below distinguishes
      // the two outcomes instead of claiming the good one unconditionally. Path 2 (the
      // `claude mcp add-json` CLI registration) is NOT undone — same reasoning as there — so
      // its residual is named in the thrown message instead of silently left for the outer
      // catch's generic error text to hide.
      let sessionId: string
      try {
        sessionId = await services.tmux.createSession(name, { ...opts, cwd, command })
      } catch (err) {
        // Two outcomes, two sentences. Until the follow-up review of 4358cac this text hung
        // on "there was a closure" alone and claimed the rollback unconditionally — also
        // where the closure had thrown, and where it had bailed out without doing anything.
        // A false all-clear about a credential is worse than no note at all.
        let zurueckgenommen = false
        if (undoInjection) {
          try {
            zurueckgenommen = undoInjection()
          } catch (undoErr) {
            console.warn(
              '[ipc] rollback of MCP settings.local.json after failed createSession also failed:',
              undoErr,
            )
          }
        }
        const tmuxMsg = err instanceof Error ? err.message : String(err)
        let residualNote = ''
        if (undoInjection && zurueckgenommen) {
          // The CLI entry (path 2) stays put by design — see postLaunchInjection's doc
          // comment. An app restart does not remove it; it rotates the key and thereby
          // makes the entry worthless, which is not the same thing and reads differently
          // to whoever goes looking for it.
          residualNote =
            ' Der lokale MCP-Eintrag in settings.local.json wurde zurueckgenommen; ein ' +
            'ueber die claude-CLI registrierter Eintrag (falls geschrieben) kann bestehen ' +
            'bleiben, bis er ueberschrieben wird — ein App-Neustart entfernt ihn nicht, ' +
            'macht ihn aber wertlos, weil der Schluessel bei jedem App-Start wechselt.'
        } else if (undoInjection) {
          residualNote =
            ' Achtung: der lokale MCP-Eintrag in settings.local.json konnte nicht ' +
            'zurueckgenommen werden — dort kann ein gueltiger Zugangsschluessel liegen ' +
            'bleiben.'
        }
        throw new Error(tmuxMsg + residualNote)
      }
      services.tmux.watchSession(name, name)

      if (ctx && services.graphWriter) {
        try {
          writeSessionNode(services.graphWriter, { ...ctx, name })
        } catch (err) {
          console.warn('[ipc] session node write failed:', err)
        }
      }

      // Surfaced to the renderer so a wrong-shaped tier assignment (F2) or a failed/skipped
      // MCP registration (I-2 minor, security review 2026-08-30) is visible somewhere a user
      // might see it, not only in a main-process console.warn. Joined rather than picking
      // one: both are independent, both are rare, and a session can hit both at once. An
      // extra field on an already-untyped IPC result — no contract redesign.
      const hinweis = [cliErgebnis?.hinweis, mcpHinweis]
        .filter((h): h is string => !!h)
        .join(' ') || null
      return { id: sessionId, name, error: null, hinweis }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { id: null, name: null, error: msg }
    }
  })

  ipcMain.handle(SESSION_DESTROY, async (_event, name: string) => {
    try {
      const zelle = schleifenZellen.hole(name)
      if (zelle) {
        // If one is running, it ends at the next turn boundary — like every abort — and
        // writes its own run.finished to the log. The cell is already gone by then; the
        // log stays readable in the harness window. That is more honest than leaving the
        // cell standing until the run ends and pretending it is still there.
        if (zelle.laufId && zelle.zustand === 'laeuft') {
          const adapter = adapterRegistry.get('keel-harness')
          if (adapter && istSchleifenAdapter(adapter)) {
            adapter.brichAb(zelle.laufId)
          } else {
            // Nothing silently swallowed, even for a branch believed unreachable today
            // (registerIpcHandlers always registers 'keel-harness'): KeelHarnessAdapter's
            // own brichAb() logs a failed abort from inside itself (its dynamic-import
            // .catch) — this is the sibling case, the lookup failing before brichAb is ever
            // called, and without this branch that failure would vanish along with the
            // cell being removed two lines below.
            console.error(
              `[ipc] Zelle '${name}' hatte einen laufenden Auftrag (${zelle.laufId}), aber ` +
              `der keel-harness-Adapter war nicht auffindbar oder keine Schleife — Abbruch ` +
              `nicht gesetzt.`
            )
          }
        }
        schleifenZellen.entferne(name)
        praefixJeZelle.delete(name)
        return { ok: true, error: null }
      }
      services.tmux.unwatchSession(name)
      await services.tmux.killSession(name)
      removeEntityPromptFile(app.getPath('userData'), name)
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  // Ein Auftrag an eine Niveau-B-Gitterzelle — der Sender von SESSION_STATUS_CHANGED. Der Hoerer
  // sitzt im Renderer (index.tsx, Task 10) und schreibt zustand/laufId/letzterEndzustand direkt
  // aus dieser Nutzlast in den Gitterplatz, ohne etwas davon aus dem Ereignisstrom abzuleiten.
  //
  // Der ganze Ablauf (die vier Absagen, das beiStart/beiEnde-Rennen) steht in
  // session/schleifen-auftrag.ts, geteilt mit dem `keel_zelle_beauftragen`-MCP-Werkzeug
  // (graph/mcp-server.ts) — genau eine Fassung dieser Logik, nicht zwei.
  ipcMain.handle(SESSION_AUFTRAG, async (_e, args: { name?: string; auftragstext?: string }) => {
    const name = typeof args?.name === 'string' ? args.name : ''
    const text = typeof args?.auftragstext === 'string' ? args.auftragstext : ''

    const registryEintrag = adapterRegistry.get('keel-harness')
    const adapter = registryEintrag && istSchleifenAdapter(registryEintrag) ? registryEintrag : undefined

    return beauftrageZelle({
      name, auftragstext: text, register: schleifenZellen, praefixJeZelle, adapter,
      harnessDb, lesen,
      // Typgebunden statt einer rohen broadcast()-Nutzlast: ein Tippfehler in einer der beiden
      // Formen (SessionStatusChanged, harness-types.ts) faellt so dem Typcheck auf, statt erst
      // zur Laufzeit beim Renderer, der den Kanal hoert (renderer/index.tsx:183).
      sendeStatus: (status: SessionStatusChanged) => broadcast(SESSION_STATUS_CHANGED, status),
    })
  })

  // Read-only counterpart to session:create — assembles the same prompt, starts nothing
  // and touches no project directory (CK-NFR-012). The niveau is a parameter here rather
  // than the adapter's, so a level no registered adapter serves can still be inspected.
  ipcMain.handle(PRESET_PREVIEW_PROMPT, async (_e, args: { entityId: string; niveau?: string }) => {
    const niveau = args?.niveau === 'B' ? CapabilityNiveau.B
      : args?.niveau === 'C' ? CapabilityNiveau.C
      : CapabilityNiveau.A
    // Same graph handle session:create uses — otherwise the preview would omit the
    // phaseninput layer and quietly stop matching what is delivered.
    const preview = await buildPromptPreview(
      args?.entityId, niveau, configStore.get('agent').modelTiers, services.graphDb,
    )
    return preview ?? { error: `Unknown entity '${args?.entityId}'` }
  })

  ipcMain.on(TERMINAL_DATA_OUTBOUND, (_event, sessionName: string, data: string) => {
    services.tmux.sendKeys(sessionName, data).catch((err) => {
      console.error('[ipc-handlers] sendKeys failed:', err)
    })
  })

  ipcMain.on(TERMINAL_RESIZE, (_event, sessionName: string, cols: number, rows: number) => {
    services.tmux.resizePane(sessionName, cols, rows).catch((err) => {
      console.error('[ipc-handlers] resizePane failed:', err)
    })
  })

  // ---------------------------------------------------------------------------
  // Knowledge Graph handlers (CK-GRAPH-037)
  // ---------------------------------------------------------------------------

  ipcMain.handle(GRAPH_SEARCH, async (_event, params: { query: string; limit?: number; kind?: string }) => {
    if (!services.graphDb) return { hits: [], error: 'Graph not initialized' }
    try {
      // IPC payloads carry `kind` as a plain string (the wire format cannot
      // express NodeKind's literal union); graphSearch treats an unknown
      // kind as a filter that simply matches nothing, so this narrowing is
      // safe at the boundary without re-validating here.
      return graphSearch(services.graphDb, params as SearchParams)
    } catch (err) {
      return { hits: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_READ, async (_event, uid: string) => {
    if (!services.graphDb) return null
    try {
      return graphGetNode(services.graphDb, uid)
    } catch {
      return null
    }
  })

  ipcMain.handle(GRAPH_EXPAND, async (_event, params: { uid: string; depth?: number; edge_type?: string; direction?: string }) => {
    if (!services.graphDb) return { center: null, neighbors: [], edges: [] }
    try {
      // Same IPC-boundary narrowing as GRAPH_SEARCH above. Unlike `kind`,
      // graphExpand actively validates edge_type against the allowlist
      // (isValidEdgeType, F-ADV-001) and throws on an unrecognized value —
      // caught below and returned as a graceful error, not a crash.
      return graphExpand(services.graphDb, params as ExpandParams)
    } catch (err) {
      return { center: null, neighbors: [], edges: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_QUERY, async (_event, params: { template: string; params?: Record<string, unknown> }) => {
    if (!services.graphDb) return { rows: [], error: 'Graph not initialized' }
    try {
      return graphQuery(services.graphDb, params)
    } catch (err) {
      return { rows: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_WRITE, async (_event, input: { kind: string; title: string; [key: string]: unknown }) => {
    if (!services.graphWriter) return { uid: null, error: 'Graph not initialized' }
    try {
      return services.graphWriter.upsertNode(input as Parameters<GraphWriter['upsertNode']>[0])
    } catch (err) {
      return { uid: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_LINK, async (_event, input: { src: string; dst: string; type?: string; source?: string; props?: Record<string, unknown> }) => {
    if (!services.graphWriter) return { ok: false, error: 'Graph not initialized' }
    try {
      return services.graphWriter.linkEdge(input as Parameters<GraphWriter['linkEdge']>[0])
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_MAINTAIN, async (_event, params: { operation: string }) => {
    if (!services.graphDb) return { error: 'Graph not initialized' }
    try {
      return graphMaintain(services.graphDb, params as Parameters<typeof graphMaintain>[1])
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GRAPH_DELETE, async (_event, uid: string) => {
    if (!services.graphWriter) return { ok: false, error: 'Graph not initialized' }
    try {
      return services.graphWriter.deleteNode(uid)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---------------------------------------------------------------------------
  // Config handlers (CK-INF-008)
  // ---------------------------------------------------------------------------

  ipcMain.handle(CONFIG_GET, async (_event, key: string) => {
    try {
      return configStore.get(key as keyof CipherKeelConfig)
    } catch {
      return null
    }
  })

  ipcMain.handle(CONFIG_SET, async (_event, key: string, value: unknown) => {
    try {
      configStore.set(key as keyof CipherKeelConfig, value as CipherKeelConfig[keyof CipherKeelConfig])
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })

  // ---------------------------------------------------------------------------
  // Voice handlers (CK-VOICE-001..010)
  // ---------------------------------------------------------------------------

  ipcMain.handle(VOICE_AVAILABLE, async () => {
    if (!services.voiceManager) {
      const voiceEnabled = configStore.get('voice').enabled !== false
      return { available: false, reason: voiceEnabled ? 'Voice pipeline not initialized' : 'Voice disabled in config' }
    }
    return { available: services.voiceManager.isAvailable(), reason: services.voiceManager.isAvailable() ? null : 'STT model missing' }
  })

  ipcMain.handle(VOICE_START_SESSION, async () => {
    if (!services.voiceManager) return { ok: false, error: 'Voice not available' }
    return services.voiceManager.startSession()
  })

  ipcMain.handle(VOICE_STOP_SESSION, async () => {
    services.voiceManager?.stopSession()
    return { ok: true }
  })

  ipcMain.on(VOICE_SET_SESSION_TARGET, (_event, sessionId: string | null) => {
    services.voiceManager?.setFocusedSession(sessionId)
  })

  ipcMain.on(VOICE_SET_ROUTING_MODE, (_event, _mode: string) => {
    // mode is 'session' or 'off' — handled via start/stop session
  })

  ipcMain.on(VOICE_VAD_SPEECH_START, () => {
    services.voiceManager?.onVadSpeechStart()
  })

  ipcMain.on(VOICE_VAD_SPEECH_END, (_event, audio: number[]) => {
    services.voiceManager?.onVadSpeechEnd(audio)
  })

  ipcMain.on(VOICE_VAD_MISFIRE, () => {
    // VAD misfire — no action needed in main process
  })

  ipcMain.on(VOICE_BARGE_IN, () => {
    services.voiceManager?.stopTTS()
  })

  ipcMain.on(VOICE_PIN_SESSION, (_event, sessionId: string) => {
    services.voiceManager?.togglePin(sessionId)
  })

  // ---------------------------------------------------------------------------
  // Notes handlers (CK-NOTES-001..003)
  // ---------------------------------------------------------------------------

  ipcMain.handle(NOTES_LIST, async (_event, filterTags?: string[]) => {
    if (!services.noteManager) return []
    return services.noteManager.list(filterTags)
  })

  ipcMain.handle(NOTES_CREATE, async (_event, title: string, body: string, tags?: string[]) => {
    if (!services.noteManager) return { id: null, error: 'Notes not initialized' }
    const info = await services.noteManager.create(title, body, tags)
    if (tags?.length) {
      services.noteTagging?.updateRepository(tags)
      services.tagIndex?.rebuild()
    }
    return info
  })

  ipcMain.handle(NOTES_READ, async (_event, id: string) => {
    if (!services.noteManager) return null
    return services.noteManager.read(id)
  })

  ipcMain.handle(NOTES_SAVE, async (_event, id: string, body: string, tags?: string[]) => {
    if (!services.noteManager) return { id: null, error: 'Notes not initialized' }
    const info = await services.noteManager.save(id, body, tags)
    if (tags?.length) {
      services.noteTagging?.updateRepository(tags)
      services.tagIndex?.updateNote(id, tags)
    }
    return info
  })

  ipcMain.handle(NOTES_SAVE_RAW, async (event, id: string, rawContent: string) => {
    if (!services.noteManager) return { id: null, error: 'Notes not initialized' }
    const { info, warnings } = await services.noteManager.saveRaw(id, rawContent)
    if (warnings.length > 0) {
      event.sender.send(NOTES_VALIDATION_WARNING, warnings)
    }
    return info
  })

  ipcMain.handle(NOTES_DELETE, async (_event, id: string) => {
    if (!services.noteManager) return { ok: false }
    const ok = await services.noteManager.delete(id)
    if (ok) services.tagIndex?.removeNote(id)
    return { ok }
  })

  ipcMain.handle(NOTES_TRASH, async (_event, id: string) => {
    if (!services.noteManager) return { ok: false }
    const ok = await services.noteManager.trash(id)
    if (ok) services.tagIndex?.removeNote(id)
    return { ok }
  })

  ipcMain.handle(NOTES_TRASH_MANY, async (_event, ids: string[]) => {
    if (!services.noteManager) return { trashed: [] }
    const trashed = await services.noteManager.trashMany(ids)
    for (const id of trashed) services.tagIndex?.removeNote(id)
    return { trashed }
  })

  ipcMain.handle(NOTES_RESTORE_MANY, async (_event, ids: string[]) => {
    if (!services.noteManager) return { restored: [] }
    const restored = await services.noteManager.restoreMany(ids)
    services.tagIndex?.rebuild()
    return { restored }
  })

  ipcMain.handle(NOTES_SEARCH, async (_event, query: string, tags?: string[]) => {
    if (!services.noteManager) return []
    return services.noteManager.search(query, { tags })
  })

  ipcMain.handle(NOTES_TAGS, async () => {
    if (!services.noteTagging) return { tags: {} }
    return services.noteTagging.getTagRepository()
  })

  ipcMain.handle(NOTES_AUTO_TAG, async (_event, content: string) => {
    if (!services.noteTagging) return null
    return services.noteTagging.autoTag(content)
  })

  ipcMain.handle(NOTES_TAG_INDEX, async () => {
    if (!services.tagIndex) return { tagToNoteIds: {}, classValueCounts: {}, totalNotes: 0, builtAt: '' }
    return services.tagIndex.getIndex()
  })

  // ---------------------------------------------------------------------------
  // Project handlers (CK-INF-020)
  // ---------------------------------------------------------------------------

  ipcMain.handle(PROJECT_LIST, async () => {
    return projectManager.listProjects()
  })

  ipcMain.handle(PROJECT_CREATE, async (_event, name: string, rootPath: string) => {
    try {
      return { project: projectManager.createProject(name, rootPath), error: null }
    } catch (err) {
      return { project: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(PROJECT_SWITCH, async (_event, projectId: string) => {
    try {
      projectManager.switchProject(projectId)
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(PROJECT_GET_CURRENT, async () => {
    return projectManager.getCurrentProject()
  })

  // ---------------------------------------------------------------------------
  // Service status (CK-NFR-010 — degradation must be visible, Befund 2)
  // ---------------------------------------------------------------------------

  ipcMain.handle(SERVICES_STATUS, async () => {
    return getServiceStatus()
  })

  // ---------------------------------------------------------------------------
  // Kanban handlers (CK-UI-009, CK-UI-010, CK-UI-027, CK-UI-034)
  // ---------------------------------------------------------------------------

  ipcMain.handle(KANBAN_LIST, async () => {
    if (!services.kanbanStore) {
      return { items: [], error: subsystemError('kanban', 'Kanban store not initialized') }
    }
    try {
      return { items: services.kanbanStore.listItems(), error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { items: [], error: subsystemError('kanban', msg) }
    }
  })

  ipcMain.handle(KANBAN_CREATE, async (_event, input: CreateKanbanItemInput) => {
    if (!services.kanbanStore) return { item: null, error: 'Kanban not initialized' }
    try {
      const item = services.kanbanStore.createItem(input)
      // Notify all windows of board change — via the event bus (M-1), not a
      // direct BrowserWindow.getAllWindows() sweep.
      broadcast(KANBAN_CHANGED)
      return { item, error: null }
    } catch (err) {
      return { item: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(KANBAN_UPDATE, async (_event, input: UpdateKanbanItemInput) => {
    if (!services.kanbanStore) return { ok: false, error: 'Kanban not initialized' }
    try {
      const ok = services.kanbanStore.updateItem(input)
      if (ok) broadcast(KANBAN_CHANGED)
      return { ok, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(KANBAN_DELETE, async (_event, id: string) => {
    if (!services.kanbanStore) return { ok: false, error: 'Kanban not initialized' }
    try {
      const ok = services.kanbanStore.deleteItem(id)
      if (ok) broadcast(KANBAN_CHANGED)
      return { ok, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(KANBAN_HYGIENE, async (_event, existingPaths: string[]) => {
    if (!services.kanbanStore) return { orphans: [], error: 'Kanban not initialized' }
    try {
      const orphans = services.kanbanStore.checkOrphanedItems(new Set(existingPaths))
      return { orphans, error: null }
    } catch (err) {
      return { orphans: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---------------------------------------------------------------------------
  // P1 Übergabedokument handlers (CK-NOTES-012)
  // ---------------------------------------------------------------------------

  ipcMain.handle(P1_NORMALIZE, async (_event, markdown: string, dokumentTyp: string) => {
    try {
      return normalizeToP1Format(markdown, dokumentTyp)
    } catch (err) {
      return { normalized: markdown, warnings: [err instanceof Error ? err.message : String(err)] }
    }
  })

  // ---------------------------------------------------------------------------
  // Window management — Drei-Fenster-Modell (CK-UI-002)
  // ---------------------------------------------------------------------------

  ipcMain.handle(WINDOW_OPEN_GRID, (_event, projectId?: string) => {
    if (projectId) {
      try {
        projectManager.switchProject(projectId)
      } catch (err) {
        console.warn('[ipc] window:open-grid — switchProject failed:', err)
      }
    }
    if (!activeGridWindow || activeGridWindow.isDestroyed()) {
      activeGridWindow = createMainWindow(services)
      registerWindow(activeGridWindow)
      activeGridWindow.on('closed', () => {
        activeGridWindow = null
      })
    } else {
      activeGridWindow.focus()
    }
    return { ok: true }
  })

  ipcMain.handle(WINDOW_OPEN_SETTINGS, () => {
    if (!activeSettingsWindow || activeSettingsWindow.isDestroyed()) {
      activeSettingsWindow = createSettingsWindow(services)
      activeSettingsWindow.on('closed', () => {
        activeSettingsWindow = null
      })
    } else {
      activeSettingsWindow.focus()
    }
    return { ok: true }
  })

  registerSettingsHandlers()

  ipcMain.handle(WINDOW_OPEN_HARNESS, () => {
    if (!activeHarnessWindow || activeHarnessWindow.isDestroyed()) {
      activeHarnessWindow = createHarnessWindow(services)
      registerWindow(activeHarnessWindow)
      activeHarnessWindow.on('closed', () => {
        activeHarnessWindow = null
      })
    } else {
      activeHarnessWindow.focus()
    }
    return { ok: true }
  })

  registerHarnessHandlers(services)

  // ---------------------------------------------------------------------------
  // GitHub handlers (Phase 3b — GH-001..GH-005, GH-014, GH-015)
  // ---------------------------------------------------------------------------

  ipcMain.handle(GITHUB_CHECK_AUTH, async () => {
    try {
      return await checkAuthStatus()
    } catch (err) {
      return { ghInstalled: false, authenticated: false, username: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GITHUB_GET_TOKEN, async () => {
    try {
      return { token: await getToken(), error: null }
    } catch (err) {
      return { token: null, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GITHUB_TRIGGER_LOGIN, async () => {
    try {
      await triggerLogin()
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GITHUB_CREATE_REPO, async (
    _event,
    name: string,
    desc: string,
    visibility: 'public' | 'private',
    projectDir: string,
  ) => {
    return createRepo(name, desc, visibility, projectDir)
  })

  ipcMain.handle(GITHUB_LINK_REPO, async (_event, ownerRepo: string, projectDir: string) => {
    return linkRepo(ownerRepo, projectDir)
  })

  ipcMain.handle(GITHUB_LIST_REPOS, async (_event, token?: string, page?: number) => {
    try {
      const repos = await listUserRepos(token, page)
      return { repos, error: null }
    } catch (err) {
      return { repos: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GITHUB_STORE_PAT, async (_event, token: string) => {
    try {
      await storePat(token)
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(GITHUB_SWITCH_REPO, async (_event, ownerRepo: string, projectDir: string) => {
    return switchRepo(ownerRepo, projectDir)
  })

  // ---------------------------------------------------------------------------
  // Kickoff wizard handlers (Phase 3b — CK-UI-020, CK-PROC-001)
  // ---------------------------------------------------------------------------

  ipcMain.handle(GRAPH_INIT_PROJECT, async (_event, projectDir: string) => {
    if (!services.graphWriter) {
      return { ok: false, error: subsystemError('graph', 'Graph not initialized') }
    }
    try {
      return initProjectPhases(services.graphWriter, projectDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: subsystemError('graph', message) }
    }
  })

  ipcMain.handle(GIT_HAS_REPO, async (_event, dir: string) => {
    return { hasRepo: existsSync(join(dir, '.git')) }
  })

  ipcMain.handle(DIALOG_OPEN_DIR, async (_event, opts?: { title?: string }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts?.title ?? 'Select Directory',
      properties: ['openDirectory'],
    })
    if (canceled || filePaths.length === 0) return { canceled: true, path: null }
    return { canceled: false, path: filePaths[0] }
  })

  ipcMain.handle(PROJECT_KICKOFF, async (_event, payload: KickoffPayload) => {
    const result = await runKickoff(
      {
        writer: services.graphWriter,
        createProject: (name, rootPath) => projectManager.createProject(name, rootPath),
        gitInit: async (rootPath) => { await execFileAsync('git', ['init', rootPath]) },
        createRepo,
        linkRepo,
      },
      payload,
    )
    activateAfterKickoff((id) => projectManager.switchProject(id), result)
    return result
  })
}
