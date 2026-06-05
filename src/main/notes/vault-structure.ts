/**
 * vault-structure.ts — per-project Vault directory helpers.
 *
 * CK-NOTES-007: Ein Vault pro Projekt mit brain/ und deliverables/ Verzeichnissen.
 */

import { promises as fs } from 'fs'
import path from 'path'

/**
 * Initialises the Vault directory structure for a project.
 * Creates brain/ (for notes) and deliverables/ (for Übergabedokumente) if they
 * do not already exist.
 */
export async function initVault(projectRoot: string): Promise<void> {
  await fs.mkdir(path.join(projectRoot, 'brain'), { recursive: true })
  await fs.mkdir(path.join(projectRoot, 'deliverables'), { recursive: true })
}

/** Returns the path to the brain/ notes directory for a project. */
export function getVaultBrainDir(projectRoot: string): string {
  return path.join(projectRoot, 'brain')
}

/** Returns the path to the deliverables/ directory for a project. */
export function getVaultDeliverablesDir(projectRoot: string): string {
  return path.join(projectRoot, 'deliverables')
}
