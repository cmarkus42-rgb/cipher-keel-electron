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
// Terminal channels (tmux pane / xterm.js streaming)
// ---------------------------------------------------------------------------
export const TERMINAL_DATA_INBOUND = 'terminal:data-inbound' as const
export const TERMINAL_DATA_OUTBOUND = 'terminal:data-outbound' as const
export const TERMINAL_RESIZE = 'terminal:resize' as const
export const TERMINAL_CLEAR = 'terminal:clear' as const
export const TERMINAL_SCROLL_MARKER = 'terminal:scroll-marker' as const

// ---------------------------------------------------------------------------
// NanoClaw channels (Schenkel 2 — Peer-Runtime alongside)
// ---------------------------------------------------------------------------
export const NANOCLAW_MESSAGE_INBOUND = 'nanoclaw:message-inbound' as const
export const NANOCLAW_MESSAGE_OUTBOUND = 'nanoclaw:message-outbound' as const
export const NANOCLAW_STATUS_CHANGED = 'nanoclaw:status-changed' as const
export const NANOCLAW_CONNECT = 'nanoclaw:connect' as const
export const NANOCLAW_DISCONNECT = 'nanoclaw:disconnect' as const

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
export const CONFIG_DELETE = 'config:delete' as const
export const CONFIG_CHANGED = 'config:changed' as const

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
// Kanban channels (CK-UI-009, CK-UI-010, CK-UI-027, CK-UI-034)
// ---------------------------------------------------------------------------
export const KANBAN_LIST = 'kanban:list' as const
export const KANBAN_CREATE = 'kanban:create' as const
export const KANBAN_UPDATE = 'kanban:update' as const
export const KANBAN_DELETE = 'kanban:delete' as const
export const KANBAN_HYGIENE = 'kanban:hygiene' as const
export const KANBAN_CHANGED = 'kanban:changed' as const

// ---------------------------------------------------------------------------
// Window management channels (Drei-Fenster-Modell, CK-UI-002)
// ---------------------------------------------------------------------------
export const WINDOW_OPEN_GRID = 'window:open-grid' as const

// ---------------------------------------------------------------------------
// App lifecycle channels
// ---------------------------------------------------------------------------
export const APP_READY = 'app:ready' as const
export const APP_BEFORE_QUIT = 'app:before-quit' as const

// ---------------------------------------------------------------------------
// Union types for type-safe usage in handlers
// ---------------------------------------------------------------------------
export type MainToRendererChannel =
  | typeof SESSION_STATUS_CHANGED
  | typeof SESSION_OUTPUT
  | typeof TERMINAL_DATA_INBOUND
  | typeof TERMINAL_SCROLL_MARKER
  | typeof NANOCLAW_MESSAGE_INBOUND
  | typeof NANOCLAW_STATUS_CHANGED
  | typeof CONFIG_CHANGED
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

export type RendererToMainChannel =
  | typeof SESSION_CREATE
  | typeof SESSION_DESTROY
  | typeof SESSION_LIST
  | typeof SESSION_FOCUS
  | typeof TERMINAL_DATA_OUTBOUND
  | typeof TERMINAL_RESIZE
  | typeof TERMINAL_CLEAR
  | typeof NANOCLAW_MESSAGE_OUTBOUND
  | typeof NANOCLAW_CONNECT
  | typeof NANOCLAW_DISCONNECT
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
  | typeof CONFIG_DELETE
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
  | typeof WINDOW_OPEN_GRID
  | typeof APP_BEFORE_QUIT
