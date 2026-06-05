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
  | typeof GRAPH_SEARCH
  | typeof CONFIG_CHANGED
  | typeof STATUSLINE_CTX_UPDATE
  | typeof STATUSLINE_HOOK_DATA
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
  | typeof GRAPH_DELETE
  | typeof CONFIG_GET
  | typeof CONFIG_SET
  | typeof CONFIG_DELETE
  | typeof APP_BEFORE_QUIT
