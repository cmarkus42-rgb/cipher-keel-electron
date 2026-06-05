/**
 * default-addressee.ts — Default-Adressat-Zuordnung pro Uebergabedokument-Typ.
 *
 * CK-P1-015: Jeder der sieben Dokumenttypen hat einen definierten Default-
 * Adressat. Die Zuordnung ist konfigurierbar (nicht hardcoded) und kann per
 * Frontmatter-Feld 'adressat' ueberschrieben werden.
 */

import type { DokumentTyp } from './body-templates'

// ---------------------------------------------------------------------------
// Konfiguration — aenderbar ohne Code-Anpassung
// ---------------------------------------------------------------------------

/**
 * Kanonische Default-Zuordnung der sieben Dokumenttypen zu ihren Adressaten.
 * Quelle: P1 Abschnitt 13.1 (Tabelle der sieben Dokumente).
 *
 * Diese Map dient als Konfigurationsquelle; sie kann zur Laufzeit ersetzt
 * oder erweitert werden (z.B. projektspezifische Overrides via Config-File).
 */
const DEFAULT_ADDRESSEE_MAP: Record<DokumentTyp, string> = {
  'anforderungen':     'refinement',
  'spec':              'architect',
  'architektur-paket': 'cyber-factory',
  'build-paket':       'testing',
  'test-findings':     'fixing',
  'fix-report':        'audit',
  'audit-summary':     'release-management'
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Gibt den Default-Adressaten fuer den gegebenen Dokumenttyp zurueck.
 *
 * Gibt einen leeren String zurueck wenn der Typ unbekannt ist.
 */
export function getDefaultAddressee(dokumentTyp: string): string {
  return DEFAULT_ADDRESSEE_MAP[dokumentTyp as DokumentTyp] ?? ''
}

/**
 * Loeست den effektiven Adressaten auf:
 *   - Wenn frontmatterAdressat gesetzt und nicht leer: Override gewinnt
 *   - Sonst: Default aus der Konfiguration
 *
 * Entspricht dem Override-Mechanismus aus CK-P1-015.
 */
export function resolveAddressee(dokumentTyp: string, frontmatterAdressat?: string): string {
  if (frontmatterAdressat && frontmatterAdressat.trim() !== '') {
    return frontmatterAdressat
  }
  return getDefaultAddressee(dokumentTyp)
}
