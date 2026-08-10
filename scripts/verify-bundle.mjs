/**
 * verify-bundle.mjs — assert that inlined markdown survived the rollup build.
 *
 * The main process is bundled into a single dist/main/index.js. Markdown is
 * inlined via Vite's `?raw`; a regression back to fs.readFileSync would keep
 * every unit test green (vitest reads from disk) and only break in the packaged
 * app, where the source tree does not exist. This is the guard for that.
 *
 * Run after `npm run build`.
 */
import { readFileSync, existsSync } from 'node:fs'

const BUNDLE = 'dist/main/index.js'

/**
 * Marker text that must appear in the bundle, and where it comes from.
 *
 * Pick needles that are pure ASCII and free of quotes: the markdown lands in the
 * bundle as a JS string literal, so quotes are escaped and non-ASCII may be
 * escaped too. A needle containing either would make this guard cry wolf.
 */
const MARKERS = [
  { needle: 'Du bist der Architect', source: 'src/main/preset/architect/architect-body.md' },
  { needle: 'Du bist die Cyber Factory', source: 'src/main/preset/cyber-factory/cf-body.md' },
  { needle: 'Dein Vibe ist positiver Cyberpunk', source: 'src/main/preset/shared/personas/cipher.md' },
  { needle: 'Stelle gezielte, freundliche Gegenfragen', source: 'src/main/preset/shared/personas/theaitetos.md' },
  {
    needle: 'implementierungsfertiger Code ist verboten',
    source: 'src/main/preset/architect/capabilities/architect-core-identity/SKILL.md',
  },
]

if (!existsSync(BUNDLE)) {
  console.error(`[verify-bundle] ${BUNDLE} is missing — run \`npm run build\` first`)
  process.exitCode = 1
} else {
  const bundle = readFileSync(BUNDLE, 'utf-8')
  const missing = MARKERS.filter(m => !bundle.includes(m.needle))

  for (const m of missing) {
    console.error(`[verify-bundle] MISSING: ${m.source} — text not found in ${BUNDLE}`)
  }
  if (missing.length > 0) {
    console.error(
      `[verify-bundle] ${missing.length}/${MARKERS.length} markers missing. ` +
      'Inlined markdown did not survive bundling; the packaged app would lose it silently.'
    )
    process.exitCode = 1
  } else {
    console.log(`[verify-bundle] OK — ${MARKERS.length}/${MARKERS.length} markers present`)
  }
}
