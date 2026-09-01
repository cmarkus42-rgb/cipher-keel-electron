import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  KimiCodeAdapter,
  baueAgentDatei,
  schreibeAgentDatei,
} from '../../src/main/agent/adapters/kimi-code'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { istSchleifenAdapter, SITZUNG_FREMDES_CLI } from '../../src/main/agent/agent-adapter'
import { isCommandOnPath } from '../../src/main/util/exec-util'

// Only isCommandOnPath is replaced: isAvailable() must be steerable in both directions, and
// whether a `kimi` binary happens to sit on the test machine's PATH is not what these tests
// are about. Every fs write below happens for real, against a mkdtemp directory.
vi.mock('../../src/main/util/exec-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/util/exec-util')>()
  return { ...actual, isCommandOnPath: vi.fn(() => true) }
})

// Written with concatenation rather than a template literal on purpose: the sequence this
// adapter guards against is exactly the one TypeScript would interpolate here.
const PLATZHALTER = '$' + '{base_prompt}'

function adapter(startArgs: string[] = []): KimiCodeAdapter {
  return new KimiCodeAdapter({ getStartArgs: () => startArgs })
}

const opts = { projectPath: '/tmp/p', sessionName: 'keel-demo-architekt-ab12' }

describe('KimiCodeAdapter Startbefehl', () => {
  it('startet kimi und bindet den Entitaets-Prompt ueber --agent-file', () => {
    const cmd = adapter().buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.cmd).toBe('kimi')
    expect(cmd.args).toContain('--agent-file')
    expect(cmd.args[cmd.args.indexOf('--agent-file') + 1]).toBe('/tmp/x.md')
  })

  it('setzt die freien Startparameter des Nutzers vor die eigenen Schalter', () => {
    const cmd = adapter(['-y']).buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.args[0]).toBe('-y')
    expect(cmd.args.indexOf('--agent-file')).toBeGreaterThan(0)
  })

  it('setzt beim Fortsetzen der letzten Sitzung -c und laesst --agent-file weg', () => {
    const cmd = adapter().buildLaunchCommand({ ...opts, resume: true })
    expect(cmd.args).toContain('-c')
    expect(cmd.args).not.toContain('--agent-file')
  })

  it('setzt beim Fortsetzen mit Id -S <id> und laesst --agent-file weg', () => {
    const cmd = adapter().buildLaunchCommand({ ...opts, resumeSessionId: 'sess-7' })
    expect(cmd.args).toContain('-S')
    expect(cmd.args[cmd.args.indexOf('-S') + 1]).toBe('sess-7')
    expect(cmd.args).not.toContain('--agent-file')
  })

  it('bricht ab, wenn Prompt und Fortsetzen zugleich verlangt werden, und nennt beide Schalter', () => {
    expect(() => adapter().buildLaunchCommand({
      ...opts, appendSystemPromptFile: '/tmp/x.md', resume: true,
    })).toThrow(/--agent-file[\s\S]*--continue|--continue[\s\S]*--agent-file/)
  })

  it('bricht auch bei Prompt zusammen mit -S ab', () => {
    expect(() => adapter().buildLaunchCommand({
      ...opts, appendSystemPromptFile: '/tmp/x.md', resumeSessionId: 'sess-7',
    })).toThrow(/--agent-file[\s\S]*--session|--session[\s\S]*--agent-file/)
  })

  it('bricht benannt ab, wenn ein Fork verlangt wird', () => {
    expect(() => adapter().buildLaunchCommand({
      ...opts, forkFromClaudeSessionId: 'sess-9',
    })).toThrow(/[Ff]ork/)
  })

  it('uebergibt niemals ein Modell, auch wenn eines aufgeloest wurde', () => {
    const cmd = adapter().buildLaunchCommand({
      ...opts, appendSystemPromptFile: '/tmp/x.md', model: 'kimi-k2',
    })
    expect(cmd.args).not.toContain('-m')
    expect(cmd.args).not.toContain('--model')
    expect(cmd.args).not.toContain('kimi-k2')
  })

  it('nennt --model nicht unter den app-gesteuerten Parametern', () => {
    expect(adapter().appGesteuerteParameter).not.toContain('--model')
    expect(adapter().appGesteuerteParameter).not.toContain('-m')
    expect(adapter().appGesteuerteParameter).toContain('--agent-file')
  })

  it('bricht ab, wenn ein Fortsetzen-Schalter in den freien Startparametern steht', () => {
    // Kimis Parser braeche auch selbst ab — aber an der falschen Stelle: der Mensch saehe
    // einen Parser-Fehler im Pane statt der Erklaerung.
    for (const getippt of ['-c', '--continue', '-S', '--session', '--session=abc']) {
      expect(() => adapter([getippt]).buildLaunchCommand({
        ...opts, appendSystemPromptFile: '/tmp/x.md',
      }), getippt).toThrow(/--agent-file/)
    }
  })

  it('laesst freie Startparameter durch, die nichts mit dem Fortsetzen zu tun haben', () => {
    const cmd = adapter(['-y', '--plan']).buildLaunchCommand({
      ...opts, appendSystemPromptFile: '/tmp/x.md',
    })
    expect(cmd.args.slice(0, 2)).toEqual(['-y', '--plan'])
  })

  it('startet nicht mit leerem Prompt-Pfad', () => {
    expect(() => adapter().buildLaunchCommand({ ...opts, appendSystemPromptFile: '' }))
      .toThrow(/--agent-file/)
  })
})

describe('KimiCodeAdapter Hinweise', () => {
  it('benennt einen aufgeloesten Tier-Platz, statt ihn still zu verschlucken', () => {
    const cmd = adapter().buildLaunchCommand({ ...opts, model: 'kimi-k2' })
    expect(cmd.hinweise?.join(' ')).toMatch(/Tier-Platz gilt fuer diesen Harness nicht/)
    expect(cmd.hinweise?.join(' ')).toMatch(/eigenen Konfiguration/)
  })

  it('schweigt ganz, wenn es zu diesem Start nichts zu sagen gibt', () => {
    // Kein leeres Array: ein Feld, das jeder Start setzt, liest bald niemand mehr.
    expect(adapter().buildLaunchCommand({ ...opts }).hinweise).toBeUndefined()
  })

  it('traegt die Trust-Rueckfrage nicht am Startbefehl, sondern an der Einspritzung', () => {
    // Sie gilt, weil eine projektlokale mcp.json geschrieben wird — nicht, weil eine
    // Kommandozeile gebaut wird. Am Startbefehl stuende sie auch dann, wenn gar kein
    // MCP-Server laeuft und niemand nach Vertrauen gefragt wird.
    const cmd = adapter().buildLaunchCommand({ ...opts, model: 'kimi-k2' })
    expect(cmd.hinweise?.join(' ') ?? '').not.toMatch(/trust/i)
    expect(adapter().mcpEinspritzung?.vertrauensHinweis).toMatch(/Don't trust/)
  })

  it('nennt den Ort seiner Einspritzung und hat keinen nicht zuruecknehmbaren Rest', () => {
    // Anders als bei Claude: kein mcp-Befehl, also kein zweiter Weg, der liegen bliebe.
    expect(adapter().mcpEinspritzung?.ort).toBe('.kimi-code/mcp.json')
    expect(adapter().mcpEinspritzung?.nichtZuruecknehmbarerRest).toBeUndefined()
  })

  it('setzt beim Claude-Adapter keine Hinweise', async () => {
    const { ClaudeCodeAdapter } = await import('../../src/main/agent/adapters/claude-code')
    const cmd = new ClaudeCodeAdapter({ getStartArgs: () => [] })
      .buildLaunchCommand({ ...opts, model: 'sonnet' })
    expect(cmd.hinweise).toBeUndefined()
  })
})

describe('KimiCodeAdapter Agent-Datei', () => {
  it('setzt description im Frontmatter', () => {
    const text = baueAgentDatei('keel-demo-architekt-ab12', 'Du bist eine Entitaet.')
    expect(text).toMatch(/^---\n/)
    expect(text).toMatch(/\ndescription: \S/)
  })

  it('normalisiert name auf kebab-case', () => {
    const text = baueAgentDatei('Keel_Demo Architekt_AB12', 'Du bist eine Entitaet.')
    expect(text).toMatch(/\nname: keel-demo-architekt-ab12\n/)
  })

  it('setzt den Basis-Platzhalter als erste Zeile des Rumpfs, dann eine Leerzeile', () => {
    const text = baueAgentDatei('keel-x', 'Du bist eine Entitaet.')
    const zeilen = text.split('\n')
    const rumpfStart = zeilen.indexOf('---', 1) + 1
    expect(zeilen[rumpfStart]).toBe(PLATZHALTER)
    expect(zeilen[rumpfStart + 1]).toBe('')
    expect(zeilen[rumpfStart + 2]).toBe('Du bist eine Entitaet.')
  })

  it('bricht ab, wenn der Prompt eine Template-Sequenz enthaelt, und nennt Zeile und Sequenz', () => {
    const prompt = 'Zeile eins\nZeile zwei\nNimm $' + '{foo} aus der Umgebung.'
    expect(() => baueAgentDatei('keel-x', prompt)).toThrow(/Zeile 9/)
    expect(() => baueAgentDatei('keel-x', prompt)).toThrow(/\$\{foo\}/)
  })

  it('bricht auch bei einem zweiten Basis-Platzhalter im Prompt ab', () => {
    // Zeile 8 der Agent-Datei — die erste steht in Zeile 5 und ist die einzige erlaubte.
    expect(() => baueAgentDatei('keel-x', 'Text\n' + PLATZHALTER)).toThrow(/Zeile 8/)
  })

  it('laesst den selbst gesetzten Basis-Platzhalter durch', () => {
    const text = baueAgentDatei('keel-x', 'Ein Prompt ganz ohne Sequenzen.')
    expect(text.split('$' + '{').length - 1).toBe(1)
  })

  it('bricht ab, wenn aus dem Sitzungsnamen kein kebab-case-Name wird', () => {
    expect(() => baueAgentDatei('...', 'Prompt')).toThrow(/kebab/)
  })
})

describe('KimiCodeAdapter schreibt die Agent-Datei', () => {
  let tmp: string
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-kimi-')) })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('legt sie im selben Verzeichnis ab wie der Claude-Weg, mit Modus 0600', () => {
    const p = schreibeAgentDatei(tmp, 'keel-x', 'Ein Prompt.')
    expect(p).toBe(path.join(tmp, 'entity-prompts', 'keel-x.md'))
    expect(fs.readFileSync(p, 'utf-8')).toBe(baueAgentDatei('keel-x', 'Ein Prompt.'))
    expect(fs.statSync(p).mode & 0o777).toBe(0o600)
  })

  it('schreibt nichts, wenn die Wache anschlaegt', () => {
    expect(() => schreibeAgentDatei(tmp, 'keel-x', 'Nimm $' + '{foo}.')).toThrow()
    expect(fs.existsSync(path.join(tmp, 'entity-prompts', 'keel-x.md'))).toBe(false)
  })

  it('liefert ueber die Pflichtmethode des Adapters dieselbe Datei', () => {
    // Der Weg, den SESSION_CREATE geht: der Adapter entscheidet das Format, nicht der
    // Handler. Fuer Kimi ist das die Agent-Datei, nicht der rohe Prompt.
    const p = adapter().schreibeEntitaetsPromptDatei(tmp, 'keel-x', 'Ein Prompt.')
    expect(fs.readFileSync(p, 'utf-8')).toBe(baueAgentDatei('keel-x', 'Ein Prompt.'))
  })

  it('schreibt auch ueber die Pflichtmethode nichts, wenn die Wache anschlaegt', () => {
    expect(() => adapter().schreibeEntitaetsPromptDatei(tmp, 'keel-x', 'Nimm $' + '{foo}.'))
      .toThrow(/Zeile 7/)
    expect(fs.existsSync(path.join(tmp, 'entity-prompts', 'keel-x.md'))).toBe(false)
  })
})

describe('KimiCodeAdapter postLaunchInjection', () => {
  let tmp: string
  let datei: string
  const ctx = () => ({
    projectPath: tmp,
    mcpBruecke: {
      command: '/pfad/zu/electron',
      args: ['/pfad/zu/resources/mcp-bridge.mjs', '/pfad/zu/userData/mcp-4711abcd.sock'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    },
    sessionId: 'keel-x',
  })

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-kimi-mcp-'))
    datei = path.join(tmp, '.kimi-code', 'mcp.json')
  })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('schreibt die projektlokale mcp.json mit der dokumentierten Struktur', async () => {
    await adapter().postLaunchInjection(ctx())
    const geschrieben = JSON.parse(fs.readFileSync(datei, 'utf-8'))
    expect(geschrieben.mcpServers['cipher-keel']).toEqual({
      command: '/pfad/zu/electron',
      args: ['/pfad/zu/resources/mcp-bridge.mjs', '/pfad/zu/userData/mcp-4711abcd.sock'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    })
  })

  it('laesst einen fremden Eintrag stehen', async () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true })
    fs.writeFileSync(datei, JSON.stringify({ mcpServers: { fremd: { url: 'http://x' } } }))
    await adapter().postLaunchInjection(ctx())
    const geschrieben = JSON.parse(fs.readFileSync(datei, 'utf-8'))
    expect(geschrieben.mcpServers.fremd).toEqual({ url: 'http://x' })
  })

  it('nimmt den eigenen Eintrag zurueck und laesst den fremden unberuehrt', async () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true })
    fs.writeFileSync(datei, JSON.stringify({ mcpServers: { fremd: { url: 'http://x' } } }))
    const zurueck = await adapter().postLaunchInjection(ctx())
    expect(zurueck()).toBe(true)
    const danach = JSON.parse(fs.readFileSync(datei, 'utf-8'))
    expect(danach.mcpServers['cipher-keel']).toBeUndefined()
    expect(danach.mcpServers.fremd).toEqual({ url: 'http://x' })
  })

  it('stellt einen vorher vorhandenen cipher-keel-Eintrag im Wortlaut wieder her', async () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true })
    const vorher = {
      command: '/pfad/zu/electron',
      args: ['/pfad/zu/resources/mcp-bridge.mjs', '/alter/sock/mcp-00000001.sock'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }
    fs.writeFileSync(datei, JSON.stringify({ mcpServers: { 'cipher-keel': vorher } }))
    const zurueck = await adapter().postLaunchInjection(ctx())
    expect(zurueck()).toBe(true)
    const danach = JSON.parse(fs.readFileSync(datei, 'utf-8'))
    expect(danach.mcpServers['cipher-keel']).toEqual(vorher)
  })

  it('meldet true, wenn die Datei zur Ruecknahme gar nicht mehr da ist', async () => {
    const zurueck = await adapter().postLaunchInjection(ctx())
    fs.rmSync(datei)
    expect(zurueck()).toBe(true)
  })

  it('meldet false und nennt den Grund, wenn die Datei kaputtes JSON traegt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const zurueck = await adapter().postLaunchInjection(ctx())
    fs.writeFileSync(datei, '{ kaputt')
    expect(zurueck()).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('meldet false, wenn mcpServers kein Objekt mehr ist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const zurueck = await adapter().postLaunchInjection(ctx())
    fs.writeFileSync(datei, JSON.stringify({ mcpServers: 7 }))
    expect(zurueck()).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('meldet true, wenn gar nicht erst geschrieben werden konnte', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sperre = path.join(tmp, 'sperre')
    fs.writeFileSync(sperre, 'kein Verzeichnis')
    const zurueck = await adapter().postLaunchInjection({ ...ctx(), projectPath: sperre })
    expect(zurueck()).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('KimiCodeAdapter Rest der Schnittstelle', () => {
  beforeEach(() => { vi.mocked(isCommandOnPath).mockReturnValue(true) })
  afterEach(() => { vi.mocked(isCommandOnPath).mockReturnValue(true) })

  it('meldet sich als Sitzung in einem fremden CLI', () => {
    expect(adapter().sitzungsart).toBe(SITZUNG_FREMDES_CLI)
  })

  it('ist verfuegbar, wenn kimi auf dem PATH liegt, und nennt dann keinen Grund', () => {
    expect(adapter().isAvailable()).toBe(true)
    expect(adapter().nichtVerfuegbarGrund()).toBeNull()
  })

  it('nennt einen Grund genau dann, wenn kimi fehlt', () => {
    vi.mocked(isCommandOnPath).mockReturnValue(false)
    expect(adapter().isAvailable()).toBe(false)
    expect(adapter().nichtVerfuegbarGrund()).toMatch(/kimi/i)
  })

  it('behauptet keine Statuszeile und keine Unter-Agenten', () => {
    const a = adapter()
    expect(a.getCapabilities()['status-line']).toBe(false)
    expect(a.supports('status-line')).toBe(false)
    expect(a.getCapabilities()['sub-agents']).toBe(false)
    expect(a.getCapabilities()['mcp-injection']).toBe(true)
  })

  it('verweist bei executeCommand und streamOutput auf den tmux-Weg', async () => {
    await expect(adapter().executeCommand('x')).rejects.toThrow(/SessionManager/)
    const strom = adapter().streamOutput('keel-x')[Symbol.asyncIterator]()
    await expect(strom.next()).rejects.toThrow(/tmux/)
  })
})

describe('kimi-cli-tmux in der Registry', () => {
  it('loest kimi-cli-tmux auf den KimiCodeAdapter auf', () => {
    const registry = new AdapterRegistry({ getStartArgs: () => [] })
    expect(registry.getForRuntime('kimi-cli-tmux').id).toBe('kimi-code')
  })

  it('reicht die freien Startparameter bis in den Kimi-Adapter durch', () => {
    const registry = new AdapterRegistry({ getStartArgs: () => ['--plan'] })
    const gefunden = registry.getForRuntime('kimi-cli-tmux')
    if (istSchleifenAdapter(gefunden)) throw new Error('kimi ist kein Schleifen-Adapter')
    expect(gefunden.buildLaunchCommand(opts).args).toContain('--plan')
  })
})
