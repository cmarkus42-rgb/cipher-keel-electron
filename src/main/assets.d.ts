/**
 * Vite `?raw` imports — markdown compiled into the main bundle as a string.
 *
 * The main process is bundled by rollup into a single dist/main/index.js and
 * packaged into app.asar. Reading markdown via fs at runtime would need both a
 * copy step and an asar-aware path; inlining avoids both.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
