#!/usr/bin/env node
/**
 * smoke-packaged.mjs — startet das gepackte Artefakt und prueft, ob der
 * Knowledge Graph im Paket wirklich hochkommt.
 *
 * Existiert, weil die Testsuite unter Node laeuft und dort dieselben nativen
 * Artefakte korrekt laedt, die im Paket brechen. Gruene Tests sagen ueber das
 * Paket nichts aus (Handover Phase 7, Abschnitt 9).
 *
 * Nutzt ein Wegwerf-userData-Verzeichnis, damit der echte Graph des Nutzers
 * unberuehrt bleibt.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP = 'release/mac-arm64/cipher keel.app/Contents/MacOS/cipher keel'
const READY = '[service-lifecycle] Knowledge Graph initialized'
const FAILED = '[service-lifecycle] Knowledge Graph init failed'
const TIMEOUT_MS = 60_000

if (!existsSync(APP)) {
  console.error(`SMOKE FAIL — no packaged app at ${APP}. Run \`npm run pack\` first.`)
  process.exit(1)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'keel-smoke-'))
const child = spawn(APP, [`--user-data-dir=${userDataDir}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
})

let transcript = ''
let settled = false

function finish(code, message) {
  if (settled) return
  settled = true
  child.kill('SIGTERM')
  rmSync(userDataDir, { recursive: true, force: true })
  console.log(message)
  process.exit(code)
}

function onChunk(buffer) {
  transcript += buffer.toString()
  if (transcript.includes(FAILED)) {
    const detail = transcript.slice(transcript.indexOf(FAILED), transcript.indexOf(FAILED) + 700)
    finish(1, `SMOKE FAIL — the graph did not initialise in the packaged app:\n\n${detail}`)
  }
  if (transcript.includes(READY)) {
    finish(0, 'SMOKE PASS — graph=ready in the packaged app')
  }
}

child.stdout.on('data', onChunk)
child.stderr.on('data', onChunk)
child.on('error', (err) => finish(1, `SMOKE FAIL — could not launch ${APP}: ${err.message}`))
child.on('exit', (code) => finish(1, `SMOKE FAIL — app exited (code ${code}) before any graph verdict`))

setTimeout(
  () => finish(1, `SMOKE FAIL — no graph verdict within ${TIMEOUT_MS / 1000}s`),
  TIMEOUT_MS,
)
