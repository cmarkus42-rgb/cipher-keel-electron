/**
 * cipher-keel-electron — Renderer process entry point.
 *
 * Access to Electron main process goes exclusively through window.cipherKeel
 * (exposed via src/preload.ts via contextBridge).
 *
 * No direct access to Node.js APIs — renderer runs with:
 *   contextIsolation: true, nodeIntegration: false, sandbox: true
 */

import { APP_READY } from '@shared/ipc-channels'

function renderSkeleton(container: HTMLElement): void {
  const wrapper = document.createElement('div')
  wrapper.style.cssText =
    'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#666'

  const title = document.createElement('div')
  title.style.cssText = 'font-size:18px;color:#999;letter-spacing:0.1em'
  title.textContent = 'cipher keel'

  const sub = document.createElement('div')
  sub.style.cssText = 'font-size:11px;color:#444'
  sub.textContent = 'skeleton — BT-3a'

  wrapper.appendChild(title)
  wrapper.appendChild(sub)
  container.appendChild(wrapper)
}

function init(): void {
  const app = document.getElementById('app')
  if (!app) return

  renderSkeleton(app)

  // Listen for APP_READY from main process
  window.cipherKeel.on(APP_READY, (_event, data) => {
    console.log('[renderer] app ready', data)
  })
}

init()
