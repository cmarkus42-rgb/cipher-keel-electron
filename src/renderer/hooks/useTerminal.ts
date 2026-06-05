/**
 * useTerminal — React hook for xterm.js terminal management.
 *
 * Initializes xterm.js with WebGL (Canvas fallback), handles resize
 * via FitAddon, and connects to IPC for data in/out.
 *
 * Ported from cipher-mux 0.9.x (CK-INF-006).
 */

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'

const api = () => (window as any).cipherKeel

/** Minimum container dimension (px) to attempt fit. */
const MIN_FIT_DIMENSION = 50

/** Debounce interval (ms) for fit() calls. */
const FIT_DEBOUNCE_MS = 150

export interface UseTerminalResult {
  terminalRef: React.RefObject<HTMLDivElement | null>
  fit: () => void
}

function getTerminalTheme(): Record<string, string> {
  return {
    background: '#0d0d0d',
    foreground: '#e0e0e0',
    cursor: '#f0f0f0',
    selectionBackground: '#444444',
    black: '#000000',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  }
}

export function useTerminal(sessionId: string): UseTerminalResult {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 })

  const fitAndSync = useCallback((): boolean => {
    const fitAddon = fitAddonRef.current
    const term = termRef.current
    const container = terminalRef.current
    if (!fitAddon || !term || !container) return false

    const { clientWidth, clientHeight } = container
    if (clientWidth < MIN_FIT_DIMENSION || clientHeight < MIN_FIT_DIMENSION) return false

    try {
      const buf = term.buffer.active
      const wasAtBottom = buf.viewportY >= buf.baseY
      const savedViewportY = buf.viewportY

      fitAddon.fit()
      try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }

      if (!wasAtBottom) {
        term.scrollToLine(Math.min(savedViewportY, buf.baseY))
      }

      const { cols, rows } = term
      const last = lastSizeRef.current
      if (cols !== last.cols || rows !== last.rows) {
        lastSizeRef.current = { cols, rows }
        api().send('terminal:resize', sessionId, cols, rows)
      }
      return true
    } catch {
      return false
    }
  }, [sessionId])

  const fit = useCallback(() => {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
    fitTimerRef.current = setTimeout(() => {
      fitTimerRef.current = null
      fitAndSync()
    }, FIT_DEBOUNCE_MS)
  }, [fitAndSync])

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: getTerminalTheme(),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    // Cmd+C with selection → clipboard copy instead of SIGINT
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true
      if (!ev.metaKey) return true
      if (ev.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false
      }
      if (ev.key === 'x' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      return true
    })

    // Try WebGL, fall back to Canvas
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        webgl.dispose()
        try { term.loadAddon(new CanvasAddon()) } catch { /* basic renderer */ }
        try { term.refresh(0, term.rows - 1) } catch { /* ignore */ }
      })
      term.loadAddon(webgl)
    } catch {
      try { term.loadAddon(new CanvasAddon()) } catch { /* basic renderer is fine */ }
    }

    termRef.current = term
    fitAddonRef.current = fitAddon

    // ResizeObserver for container changes
    let reported = false
    const immediateFit = () => {
      if (fitAndSync()) {
        if (!reported && term.cols >= 20 && term.rows >= 5) {
          reported = true
          lastSizeRef.current = { cols: term.cols, rows: term.rows }
        }
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!reported) {
        immediateFit()
      } else {
        fit()
      }
    })
    resizeObserver.observe(container)

    // Initial fit
    requestAnimationFrame(() => immediateFit())
    setTimeout(() => immediateFit(), 200)

    // Send user input to main process
    const inputDisposable = term.onData((data: string) => {
      api().send('terminal:data-outbound', sessionId, data)
    })

    // Receive output from main process
    const unsubscribe = api().on('session:output', (_event: unknown, paneId: string, data: string) => {
      if (paneId === sessionId) {
        term.write(data)
      }
    })

    return () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
      resizeObserver.disconnect()
      inputDisposable.dispose()
      unsubscribe()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      lastSizeRef.current = { cols: 0, rows: 0 }
    }
  }, [sessionId])

  return { terminalRef, fit }
}
