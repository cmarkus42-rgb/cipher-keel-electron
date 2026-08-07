/**
 * uid.ts — Deterministic ULID generation from natural keys.
 *
 * CK-GRAPH-044: uid is ULID-conformant (time-sortable, 128-bit, Crockford-Base32).
 *               Deterministic from natural key at creation — double creation of
 *               the same artifact produces identical uid (idempotency).
 *
 * CK-GRAPH-012: Entity-Resolution runs over natural key, not LLM judgement.
 */

import { createHash, randomBytes } from 'crypto'

// Crockford Base32 alphabet (uppercase, no I/L/O/U)
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Encode a byte buffer into Crockford Base32.
 * Each char encodes 5 bits. Length must be a multiple of 5 bits.
 */
function encodeCrockford(bytes: Buffer, bitCount: number): string {
  let result = ''
  let bits = 0
  let value = 0

  for (let i = 0; i < bytes.length && bits < bitCount; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += CROCKFORD[(value >>> bits) & 0x1f]
    }
  }
  // Flush remaining bits (if any, left-padded with zeros)
  if (bits > 0) {
    result += CROCKFORD[(value << (5 - bits)) & 0x1f]
  }
  return result
}

/**
 * Generate a deterministic ULID from a natural key.
 *
 * The entire 128-bit ULID is derived from SHA-256(naturalKey):
 *   - bytes 0..5  → 48-bit "timestamp" portion (10 Crockford chars)
 *   - bytes 6..15 → 80-bit "randomness" portion (16 Crockford chars)
 *
 * Guarantees: same naturalKey → same uid, always.
 */
export function deterministicUlid(naturalKey: string): string {
  const hash = createHash('sha256').update(naturalKey).digest()
  const timePart = encodeCrockford(hash.subarray(0, 6), 48)   // 10 chars
  const randPart = encodeCrockford(hash.subarray(6, 16), 80)  // 16 chars
  return timePart + randPart
}

/**
 * Generate a fresh (non-deterministic) ULID with real timestamp + random.
 * Used when no natural key applies.
 */
export function freshUlid(): string {
  const now = Date.now()

  // Encode 48-bit timestamp (milliseconds since epoch) → 10 Crockford chars
  const timeBuf = Buffer.alloc(6)
  timeBuf.writeUIntBE(now, 0, 6)
  const timePart = encodeCrockford(timeBuf, 48)

  // 80-bit random → 16 Crockford chars
  const randBuf = randomBytes(10)
  const randPart = encodeCrockford(randBuf, 80)

  return timePart + randPart
}

// ULID: 26 Crockford Base32 chars
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

/**
 * Validate a string as ULID-conformant.
 */
export function isValidUlid(s: string): boolean {
  return ULID_RE.test(s)
}

/**
 * Derive the natural key for a given node type.
 *
 * CK-GRAPH-012: Natural key is type-specific:
 *   - anforderung, entscheidung, artefakt, test, note: Vault-path at creation
 *   - phase_subsystem: Vault-path at creation
 *   - github_repo: url
 *   - anlass: session ID + start timestamp
 */
export function naturalKey(
  kind: string,
  fields: { path?: string; url?: string; session?: string; zeitpunkt?: string }
): string {
  switch (kind) {
    case 'anlass':
      if (!fields.session || !fields.zeitpunkt)
        throw new Error(`Natural key for 'anlass' requires session + zeitpunkt`)
      return `anlass:${fields.session}:${fields.zeitpunkt}`
    case 'github_repo':
      if (!fields.url) throw new Error(`Natural key for 'github_repo' requires url`)
      return `github_repo:${fields.url}`
    default:
      // anforderung, entscheidung, artefakt, test, note, phase_subsystem
      if (!fields.path) throw new Error(`Natural key for '${kind}' requires path`)
      return `${kind}:${fields.path}`
  }
}
