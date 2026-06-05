/**
 * generateWorkerAssignment — Niveau-C-taugliches Worker-Startup-Protokoll.
 *
 * Niveau-C check: "Kann ein Entwickler, der das Projekt nie gesehen hat,
 * diesen Task allein starten?"
 *
 * CK-INF-013
 */

export interface WorkerAssignmentOptions {
  /** The task description (what to implement) */
  taskText: string
  /** Module identifier, e.g. "CK-INF-012" */
  modul: string
  /** Completion criterion — when is the task done? */
  abschlussKriterium: string
  /** Absolute path to the project root */
  projektPfad: string
  /** Files the worker must read before starting */
  relevanteeDateien: string[]
}

/**
 * Generates a structured worker assignment document.
 * Template is parametrized — no hardcoded task-specific content.
 */
export function generateWorkerAssignment(options: WorkerAssignmentOptions): string {
  const files =
    options.relevanteeDateien.length > 0
      ? options.relevanteeDateien.map(f => `- \`${f}\``).join('\n')
      : '_keine_'

  return `# Worker-Assignment — ${options.modul}

## Projekt-Kontext
Arbeitsverzeichnis:
\`\`\`
${options.projektPfad}
\`\`\`

**Modul:** ${options.modul}

## Aufgabe
${options.taskText}

## Relevante Dateien
Lies diese Dateien BEVOR du anfaengst:
${files}

## Abschluss-Kriterium
Die Aufgabe ist abgeschlossen wenn:
${options.abschlussKriterium}

## Startup-Protokoll
1. Dieses Dokument vollstaendig lesen.
2. Ins Projektverzeichnis navigieren: \`cd ${options.projektPfad}\`
3. Relevante Dateien (oben gelistet) lesen und verstehen.
4. Aufgabe implementieren.
5. Abschluss-Kriterium pruefen.
6. Ergebnis zurueckmelden.
`
}
