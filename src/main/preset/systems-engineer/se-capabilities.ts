/**
 * SE Capability Packages per Niveau.
 *
 * Niveau A (7): full set — graph-navigation-advanced + steuer-ueberblick-tool included
 * Niveau B (5): without graph-navigation-advanced and steuer-ueberblick-tool
 * Niveau C (1): se-core-identity only (≤ 500 tokens inline)
 *
 * companion-memory-tools was dropped 2026-08-10: it described companion_memory_*
 * MCP tools that exist in cipher-mux and not in keel — the Companion role is
 * deferred (M5 §10), so the capability goes with it.
 *
 * Phase 3c / Task 7; companion-memory-tools removal: Task 12
 */

import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

/** All 7 capability package IDs available at Niveau A. */
export const SE_CAPABILITIES_A = [
  'se-core-identity',
  'gate-urteil-guide',
  'trigger-zeiger-format',
  'steuer-ueberblick-tool',
  'handoff-logik-guide',
  'rolling-summary',
  'graph-navigation-advanced',
] as const

/** 5 capability package IDs for Niveau B (no graph-navigation-advanced, no steuer-ueberblick-tool). */
export const SE_CAPABILITIES_B = [
  'se-core-identity',
  'gate-urteil-guide',
  'trigger-zeiger-format',
  'handoff-logik-guide',
  'rolling-summary',
] as const

/** 1 capability package ID for Niveau C — inline only, max 500 tokens. */
export const SE_CAPABILITIES_C = [
  'se-core-identity',
] as const

/**
 * Returns the capability package IDs for the given SE Niveau.
 *
 * @param niveau - 'A' | 'B' | 'C'
 */
export function getSECapabilities(niveau: 'A' | 'B' | 'C'): string[] {
  switch (niveau) {
    case 'A': return [...SE_CAPABILITIES_A]
    case 'B': return [...SE_CAPABILITIES_B]
    case 'C': return [...SE_CAPABILITIES_C]
  }
}

/**
 * Capability packages for the Systems Engineer.
 *
 * rolling-summary is shared with the Architect and points at the same file —
 * one capability, one source of truth, referenced from both presets.
 */
export const SE_PACKAGES: CapabilityPackage[] = [
  {
    name: 'se-core-identity',
    beschreibung: 'Kern-Identität und Auftrag des Systems Engineer',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'gate-urteil-guide',
    beschreibung: 'Gate-Urteil an den Traceability-Gates: struktureller und Plausibilitäts-Befund getrennt geführt und gewichtet',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'trigger-zeiger-format',
    beschreibung: 'Format des zugeschnittenen Trigger-Zeigers an die nächste produktive Entität',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'steuer-ueberblick-tool',
    beschreibung: 'Aggregierende Graph-Abfrage über Subsystem-Stränge, Phasenposition und offene Gates',
    loader: LoaderType.SkillMd,
    niveauMinimum: 'A',
  },
  {
    name: 'handoff-logik-guide',
    beschreibung: 'Handoff-Logik: jede produktive Entität wird getriggert, liest Input und schreibt Output über den Graphen',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'rolling-summary',
    beschreibung: 'Rolling Summary für den SE-Koordinationsstand über Trigger, Gate-Urteile und Handoffs hinweg',
    loader: LoaderType.SkillMd,
  },
  {
    name: 'graph-navigation-advanced',
    beschreibung: 'Erweiterte Graph-Navigation: die sieben graph_*-Tools plus SE-relevante Query-Templates',
    loader: LoaderType.SkillMd,
    niveauMinimum: 'A',
  },
]
