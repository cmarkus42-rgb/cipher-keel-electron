/**
 * Typed IPC channel constants for cipher-keel-electron.
 * All Main <-> Renderer communication goes through these channels.
 * The preload bridge exposes only these declared channels.
 *
 * CK-INF-009: Electron IPC-Architektur Main-Renderer
 */

// ---------------------------------------------------------------------------
// Session channels (tmux session lifecycle)
// ---------------------------------------------------------------------------
export const SESSION_CREATE = 'session:create' as const
export const SESSION_DESTROY = 'session:destroy' as const
export const SESSION_LIST = 'session:list' as const
export const SESSION_FOCUS = 'session:focus' as const
export const SESSION_STATUS_CHANGED = 'session:status-changed' as const
export const SESSION_OUTPUT = 'session:output' as const

// ---------------------------------------------------------------------------
// Preset channels (entity assembly, read-only)
// ---------------------------------------------------------------------------
/** Assembles an entity prompt for inspection — starts nothing, writes nothing (CK-NFR-012). */
export const PRESET_PREVIEW_PROMPT = 'preset:preview-prompt' as const

// ---------------------------------------------------------------------------
// Terminal channels (tmux pane / xterm.js streaming)
// ---------------------------------------------------------------------------
export const TERMINAL_DATA_INBOUND = 'terminal:data-inbound' as const
export const TERMINAL_DATA_OUTBOUND = 'terminal:data-outbound' as const
export const TERMINAL_RESIZE = 'terminal:resize' as const
export const TERMINAL_CLEAR = 'terminal:clear' as const
export const TERMINAL_SCROLL_MARKER = 'terminal:scroll-marker' as const

// ---------------------------------------------------------------------------
// Knowledge Graph channels (M1 — SQLite + sqlite-vec)
// ---------------------------------------------------------------------------
export const GRAPH_WRITE = 'graph:write' as const
export const GRAPH_READ = 'graph:read' as const
export const GRAPH_QUERY = 'graph:query' as const
export const GRAPH_LINK = 'graph:link' as const
export const GRAPH_SEARCH = 'graph:search' as const
export const GRAPH_DELETE = 'graph:delete' as const
export const GRAPH_EXPAND = 'graph:expand' as const
export const GRAPH_MAINTAIN = 'graph:maintain' as const

// ---------------------------------------------------------------------------
// Config channels (ConfigStore — persistent JSON-File-Store)
// ---------------------------------------------------------------------------
export const CONFIG_GET = 'config:get' as const
export const CONFIG_SET = 'config:set' as const

// ---------------------------------------------------------------------------
// Status-Line / monitoring channels
// ---------------------------------------------------------------------------
export const STATUSLINE_CTX_UPDATE = 'statusline:ctx-update' as const
export const STATUSLINE_HOOK_DATA = 'statusline:hook-data' as const

// ---------------------------------------------------------------------------
// Voice channels (CK-VOICE-001..010)
// ---------------------------------------------------------------------------
export const VOICE_AVAILABLE = 'voice:available' as const
export const VOICE_START_SESSION = 'voice:start-session' as const
export const VOICE_STOP_SESSION = 'voice:stop-session' as const
export const VOICE_SET_SESSION_TARGET = 'voice:set-session-target' as const
export const VOICE_SET_ROUTING_MODE = 'voice:set-routing-mode' as const
export const VOICE_VAD_SPEECH_START = 'voice:vad-speech-start' as const
export const VOICE_VAD_SPEECH_END = 'voice:vad-speech-end' as const
export const VOICE_VAD_MISFIRE = 'voice:vad-misfire' as const
export const VOICE_BARGE_IN = 'voice:barge-in' as const
export const VOICE_PIN_SESSION = 'voice:pin-session' as const
export const VOICE_STATE = 'voice:state' as const
export const VOICE_TRANSCRIPTION = 'voice:transcription' as const
export const VOICE_DISPATCHED = 'voice:dispatched' as const
export const VOICE_ERROR = 'voice:error' as const
export const VOICE_PIN_STATUS = 'voice:pin-status' as const
export const VOICE_ACTIVE_SESSION = 'voice:active-session' as const

// ---------------------------------------------------------------------------
// Notes channels (CK-NOTES-001..003)
// ---------------------------------------------------------------------------
export const NOTES_LIST = 'notes:list' as const
export const NOTES_CREATE = 'notes:create' as const
export const NOTES_READ = 'notes:read' as const
export const NOTES_SAVE = 'notes:save' as const
export const NOTES_DELETE = 'notes:delete' as const
export const NOTES_TRASH = 'notes:trash' as const
export const NOTES_TRASH_MANY = 'notes:trash-many' as const
export const NOTES_RESTORE_MANY = 'notes:restore-many' as const
export const NOTES_SEARCH = 'notes:search' as const
export const NOTES_TAGS = 'notes:tags' as const
export const NOTES_AUTO_TAG = 'notes:auto-tag' as const
export const NOTES_TAG_INDEX = 'notes:tag-index' as const
export const NOTES_CHANGED = 'notes:changed' as const
export const NOTES_SAVE_RAW = 'notes:save-raw' as const
export const NOTES_VALIDATION_WARNING = 'notes:validation-warning' as const

// ---------------------------------------------------------------------------
// Project channels (CK-INF-020)
// ---------------------------------------------------------------------------
export const PROJECT_LIST = 'project:list' as const
export const PROJECT_CREATE = 'project:create' as const
export const PROJECT_SWITCH = 'project:switch' as const
export const PROJECT_GET_CURRENT = 'project:get-current' as const

// ---------------------------------------------------------------------------
// GitHub channels (Phase 3b — GH-001..GH-005, GH-014, GH-015)
// ---------------------------------------------------------------------------
export const GITHUB_CHECK_AUTH = 'github:check-auth' as const
export const GITHUB_GET_TOKEN = 'github:get-token' as const
export const GITHUB_TRIGGER_LOGIN = 'github:trigger-login' as const
export const GITHUB_CREATE_REPO = 'github:create-repo' as const
export const GITHUB_LINK_REPO = 'github:link-repo' as const
export const GITHUB_LIST_REPOS = 'github:list-repos' as const
export const GITHUB_STORE_PAT = 'github:store-pat' as const
export const GITHUB_SWITCH_REPO = 'github:switch-repo' as const

// ---------------------------------------------------------------------------
// Kickoff wizard channels (Phase 3b — CK-UI-020, CK-PROC-001)
// ---------------------------------------------------------------------------
export const GRAPH_INIT_PROJECT = 'graph:init-project' as const
export const GIT_HAS_REPO = 'git:has-repo' as const
export const DIALOG_OPEN_DIR = 'dialog:open-directory' as const
export const PROJECT_KICKOFF = 'project:kickoff' as const

// ---------------------------------------------------------------------------
// Kanban channels (CK-UI-009, CK-UI-010, CK-UI-027, CK-UI-034)
// ---------------------------------------------------------------------------
export const KANBAN_LIST = 'kanban:list' as const
export const KANBAN_CREATE = 'kanban:create' as const
export const KANBAN_UPDATE = 'kanban:update' as const
export const KANBAN_DELETE = 'kanban:delete' as const
export const KANBAN_HYGIENE = 'kanban:hygiene' as const
export const KANBAN_CHANGED = 'kanban:changed' as const

// ---------------------------------------------------------------------------
// P1 Übergabedokument channels (CK-NOTES-012)
// ---------------------------------------------------------------------------
export const P1_NORMALIZE = 'p1:normalize' as const

// ---------------------------------------------------------------------------
// Window management channels (Drei-Fenster-Modell, CK-UI-002)
// ---------------------------------------------------------------------------
export const WINDOW_OPEN_GRID = 'window:open-grid' as const
export const WINDOW_OPEN_SETTINGS = 'window:open-settings' as const

// ---------------------------------------------------------------------------
// Settings channels — the settings window is the only writer of config
// ---------------------------------------------------------------------------
export const SETTINGS_ANSICHT = 'settings:ansicht' as const
export const SETTINGS_ZUORDNUNG_SETZEN = 'settings:zuordnung-setzen' as const
export const SETTINGS_EINTRAG_SPEICHERN = 'settings:eintrag-speichern' as const
export const SETTINGS_EINTRAG_LOESCHEN = 'settings:eintrag-loeschen' as const
export const SETTINGS_GEHEIMNIS_SETZEN = 'settings:geheimnis-setzen' as const
export const SETTINGS_GEHEIMNIS_LOESCHEN = 'settings:geheimnis-loeschen' as const
export const SETTINGS_STARTARGS_SETZEN = 'settings:startargs-setzen' as const
export const SETTINGS_EINFACHFELD_SETZEN = 'settings:einfachfeld-setzen' as const
export const SETTINGS_RUECKFALL_ENDPUNKT_SETZEN = 'settings:rueckfall-endpunkt-setzen' as const

// ---------------------------------------------------------------------------
// Harness channels (M8 — the own agent loop)
// ---------------------------------------------------------------------------
export const HARNESS_LAUF_STARTEN = 'harness:lauf-starten' as const
export const HARNESS_LAUF_LESEN = 'harness:lauf-lesen' as const
export const HARNESS_LAUF_ABBRECHEN = 'harness:lauf-abbrechen' as const
/** Main -> Renderer: one event of a running run, as it is appended. */
export const HARNESS_EREIGNIS = 'harness:ereignis' as const
export const WINDOW_OPEN_HARNESS = 'window:open-harness' as const

// ---------------------------------------------------------------------------
// App lifecycle channels
// ---------------------------------------------------------------------------
export const APP_READY = 'app:ready' as const
export const APP_BEFORE_QUIT = 'app:before-quit' as const

// ---------------------------------------------------------------------------
// Service status channels (CK-NFR-010 — degradation must be visible)
// ---------------------------------------------------------------------------
export const SERVICES_STATUS = 'services:status' as const
/**
 * Broadcast by service-lifecycle.ts's setStatus whenever one subsystem's status
 * actually changes (Befund 3 — this channel previously had no producer, so the
 * StatusBar only ever showed the startup snapshot). Payload is a single
 * SubsystemStatus (`{ id, state, reason }`, see src/shared/service-status.ts) —
 * the one subsystem that changed, not the whole map. Listeners that want the
 * full picture re-fetch via SERVICES_STATUS.
 */
export const SERVICES_STATUS_CHANGED = 'services:status-changed' as const

// ---------------------------------------------------------------------------
// Union types for type-safe usage in handlers
// ---------------------------------------------------------------------------
export type MainToRendererChannel =
  | typeof SESSION_STATUS_CHANGED
  | typeof SESSION_OUTPUT
  | typeof TERMINAL_DATA_INBOUND
  | typeof TERMINAL_SCROLL_MARKER
  | typeof STATUSLINE_CTX_UPDATE
  | typeof STATUSLINE_HOOK_DATA
  | typeof VOICE_STATE
  | typeof VOICE_TRANSCRIPTION
  | typeof VOICE_DISPATCHED
  | typeof VOICE_ERROR
  | typeof VOICE_PIN_STATUS
  | typeof VOICE_ACTIVE_SESSION
  | typeof NOTES_CHANGED
  | typeof NOTES_VALIDATION_WARNING
  | typeof KANBAN_CHANGED
  | typeof APP_READY
  | typeof SERVICES_STATUS_CHANGED
  | typeof HARNESS_EREIGNIS

export type RendererToMainChannel =
  | typeof SESSION_CREATE
  | typeof SESSION_DESTROY
  | typeof SESSION_LIST
  | typeof SESSION_FOCUS
  | typeof PRESET_PREVIEW_PROMPT
  | typeof TERMINAL_DATA_OUTBOUND
  | typeof TERMINAL_RESIZE
  | typeof TERMINAL_CLEAR
  | typeof GRAPH_WRITE
  | typeof GRAPH_READ
  | typeof GRAPH_QUERY
  | typeof GRAPH_LINK
  | typeof GRAPH_SEARCH
  | typeof GRAPH_DELETE
  | typeof GRAPH_EXPAND
  | typeof GRAPH_MAINTAIN
  | typeof PROJECT_LIST
  | typeof PROJECT_CREATE
  | typeof PROJECT_SWITCH
  | typeof PROJECT_GET_CURRENT
  | typeof CONFIG_GET
  | typeof CONFIG_SET
  | typeof VOICE_AVAILABLE
  | typeof VOICE_START_SESSION
  | typeof VOICE_STOP_SESSION
  | typeof VOICE_SET_SESSION_TARGET
  | typeof VOICE_SET_ROUTING_MODE
  | typeof VOICE_VAD_SPEECH_START
  | typeof VOICE_VAD_SPEECH_END
  | typeof VOICE_VAD_MISFIRE
  | typeof VOICE_BARGE_IN
  | typeof VOICE_PIN_SESSION
  | typeof NOTES_LIST
  | typeof NOTES_CREATE
  | typeof NOTES_READ
  | typeof NOTES_SAVE
  | typeof NOTES_DELETE
  | typeof NOTES_TRASH
  | typeof NOTES_TRASH_MANY
  | typeof NOTES_RESTORE_MANY
  | typeof NOTES_SEARCH
  | typeof NOTES_TAGS
  | typeof NOTES_AUTO_TAG
  | typeof NOTES_TAG_INDEX
  | typeof NOTES_SAVE_RAW
  | typeof KANBAN_LIST
  | typeof KANBAN_CREATE
  | typeof KANBAN_UPDATE
  | typeof KANBAN_DELETE
  | typeof KANBAN_HYGIENE
  | typeof P1_NORMALIZE
  | typeof WINDOW_OPEN_GRID
  | typeof WINDOW_OPEN_SETTINGS
  | typeof SETTINGS_ANSICHT
  | typeof SETTINGS_ZUORDNUNG_SETZEN
  | typeof SETTINGS_EINTRAG_SPEICHERN
  | typeof SETTINGS_EINTRAG_LOESCHEN
  | typeof SETTINGS_GEHEIMNIS_SETZEN
  | typeof SETTINGS_GEHEIMNIS_LOESCHEN
  | typeof SETTINGS_STARTARGS_SETZEN
  | typeof SETTINGS_EINFACHFELD_SETZEN
  | typeof SETTINGS_RUECKFALL_ENDPUNKT_SETZEN
  | typeof APP_BEFORE_QUIT
  | typeof GITHUB_CHECK_AUTH
  | typeof GITHUB_GET_TOKEN
  | typeof GITHUB_TRIGGER_LOGIN
  | typeof GITHUB_CREATE_REPO
  | typeof GITHUB_LINK_REPO
  | typeof GITHUB_LIST_REPOS
  | typeof GITHUB_STORE_PAT
  | typeof GITHUB_SWITCH_REPO
  | typeof GRAPH_INIT_PROJECT
  | typeof GIT_HAS_REPO
  | typeof DIALOG_OPEN_DIR
  | typeof PROJECT_KICKOFF
  | typeof SERVICES_STATUS
  | typeof HARNESS_LAUF_STARTEN
  | typeof HARNESS_LAUF_LESEN
  | typeof HARNESS_LAUF_ABBRECHEN
  | typeof WINDOW_OPEN_HARNESS
