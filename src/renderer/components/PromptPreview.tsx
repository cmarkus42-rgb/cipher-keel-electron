/**
 * PromptPreview — shows the assembled entity prompt before any session starts.
 *
 * CK-NFR-012: an adjustable surface a user cannot see is not adjustable. The niveau
 * switch shows levels no adapter serves yet — that is the point of it.
 */

import { useState, useEffect, useCallback } from 'react'
import { PRESET_PREVIEW_PROMPT } from '../../shared/ipc-channels'

interface PromptPreviewProps {
  entityId: string
  label: string
  onClose: () => void
}

interface Preview {
  prompt: string
  schichten: string[]
  capabilities: string[]
  modelResolved: string | null
  wortZahl: number
}

export function PromptPreview({ entityId, label, onClose }: PromptPreviewProps) {
  const [niveau, setNiveau] = useState<'A' | 'B' | 'C'>('A')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await window.cipherKeel.invoke(PRESET_PREVIEW_PROMPT, { entityId, niveau }) as
      Preview & { error?: string }
    if (result?.error) { setError(result.error); setPreview(null) }
    else { setError(null); setPreview(result) }
  }, [entityId, niveau])

  useEffect(() => { void load() }, [load])

  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#0a0a0a', border: '1px solid #333',
      borderRadius: '4px', padding: '12px', display: 'flex', flexDirection: 'column',
      gap: '8px', zIndex: 10,
    }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <strong style={{ color: '#ddd', fontSize: '13px' }}>{label}</strong>
        {(['A', 'B', 'C'] as const).map(n => (
          <button
            key={n}
            onClick={() => setNiveau(n)}
            style={{
              padding: '2px 8px', cursor: 'pointer', fontSize: '11px',
              background: niveau === n ? '#2a2a2a' : 'transparent', color: '#bbb',
              border: '1px solid #333', borderRadius: '3px',
            }}
          >
            Niveau {n}
          </button>
        ))}
        <button
          onClick={onClose}
          title="Schließen"
          style={{
            marginLeft: 'auto', cursor: 'pointer', background: 'transparent',
            color: '#666', border: 'none', fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>

      {error && <div style={{ color: '#e0a0a0', fontSize: '11px' }}>⚠ {error}</div>}

      {preview && (
        <>
          <div style={{ color: '#777', fontSize: '10px' }}>
            Schichten: {preview.schichten.join(' · ')} — {preview.capabilities.length} Capabilities
            — Modell: {preview.modelResolved ?? 'Harness-Default'} — {preview.wortZahl} Wörter
          </div>
          <pre style={{
            flex: 1, overflow: 'auto', margin: 0, padding: '8px', background: '#050505',
            border: '1px solid #222', borderRadius: '3px', color: '#bbb',
            fontSize: '11px', whiteSpace: 'pre-wrap',
          }}>
            {preview.prompt}
          </pre>
        </>
      )}
    </div>
  )
}
