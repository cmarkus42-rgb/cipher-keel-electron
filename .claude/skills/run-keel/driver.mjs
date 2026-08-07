#!/usr/bin/env node
/**
 * driver.mjs — evaluate JavaScript inside a running cipher keel renderer over CDP.
 *
 * cipher keel is an Electron app with two windows. Its interesting behaviour lives
 * behind IPC (`window.cipherKeel.invoke(...)`), which no unit test in this repo can
 * reach — there is no electron mock. This driver is how you check that the wired app
 * actually works.
 *
 * Usage:
 *   node driver.mjs --list                          list open windows
 *   node driver.mjs <urlPart> '<js expression>'     evaluate in the matching window
 *
 * <urlPart> is a substring of the window URL:
 *   project-window   → the project window (project list, kickoff wizard, ProjectView)
 *   index.html       → the grid window (SessionGrid, StatusBar)
 *
 * The expression is evaluated with awaitPromise, so `window.cipherKeel.invoke(...)`
 * can be passed directly and the resolved value is printed as JSON.
 *
 * Port defaults to 9222; override with KEEL_CDP_PORT.
 */

const PORT = process.env.KEEL_CDP_PORT || '9222'
const [, , urlPart, expr] = process.argv

function usage(msg) {
  console.error(msg)
  console.error('usage: node driver.mjs --list | node driver.mjs <urlPart> "<js>"')
  process.exit(64)
}

if (!urlPart) usage('missing argument')

let targets
try {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  targets = (await r.json()).filter(t => t.type === 'page')
} catch {
  console.error(
    `no CDP endpoint on 127.0.0.1:${PORT} — is the app running with ` +
    `--remote-debugging-port=${PORT}? (see launch.sh)`
  )
  process.exit(69)
}

if (urlPart === '--list') {
  console.log(JSON.stringify(targets.map(t => ({ url: t.url, title: t.title })), null, 2))
  process.exit(0)
}

if (!expr) usage('missing expression')

const target = targets.find(t => t.url.includes(urlPart))
if (!target) {
  console.error(`no window matching "${urlPart}". Open windows:`)
  for (const t of targets) console.error('  ' + t.url)
  process.exit(70)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  const p = pending.get(msg.id)
  if (p) { pending.delete(msg.id); p(msg) }
})

await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', () => rej(new Error('websocket failed')))
})

function send(method, params) {
  const msgId = ++id
  return new Promise(res => {
    pending.set(msgId, res)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

const out = await send('Runtime.evaluate', {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
})

const details = out.result?.exceptionDetails
if (details) {
  console.log('EXCEPTION: ' + (details.exception?.description ?? JSON.stringify(details)))
  ws.close()
  process.exit(1)
}

const value = out.result?.result
console.log(JSON.stringify(value?.value ?? value, null, 2))
ws.close()
process.exit(0)
