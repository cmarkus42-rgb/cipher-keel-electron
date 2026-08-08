/**
 * StepGitHub — Step 4: optional GitHub repo connection.
 *
 * Calls github:check-auth on mount. Shows auth status.
 * Three options: create new repo / link existing / skip.
 * canProceed is always true (step is optional — GH-011).
 */
import { useState, useEffect } from 'react'
import { type WizardData } from '../KickoffWizard'

const api = () => window.cipherKeel

interface AuthStatus {
  ghInstalled: boolean
  authenticated: boolean
  username: string | null
}

interface RepoInfo {
  name: string
  owner: string
  url: string
  visibility: 'public' | 'private'
}

interface StepGitHubProps {
  data: WizardData
  onChange: (partial: Partial<WizardData>) => void
}

export function StepGitHub({ data, onChange }: StepGitHubProps) {
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)
  const [repoSearch, setRepoSearch] = useState('')

  const [patInput, setPatInput] = useState('')
  const [patSaving, setPatSaving] = useState(false)
  const [patError, setPatError] = useState<string | null>(null)
  const [showPatInput, setShowPatInput] = useState(false)

  // Check auth on mount
  useEffect(() => {
    setAuthChecking(true)
    ;(api().invoke('github:check-auth') as Promise<AuthStatus & { error?: string }>)
      .then((result) => {
        if (result.error) {
          setAuthError(result.error)
        } else {
          setAuth(result)
        }
      })
      .catch((err: unknown) => {
        setAuthError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setAuthChecking(false))
  }, [])

  // Load repos when "link" is selected and auth is ok
  useEffect(() => {
    if (data.githubAction !== 'link' || !auth?.authenticated) return
    setReposLoading(true)
    setReposError(null)
    ;(api().invoke('github:list-repos') as Promise<{ repos: RepoInfo[]; error?: string }>)
      .then((result) => {
        if (result.error) {
          setReposError(result.error)
        } else {
          setRepos(result.repos ?? [])
        }
      })
      .catch((err: unknown) => {
        setReposError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setReposLoading(false))
  }, [data.githubAction, auth?.authenticated])

  const handleSavePat = async () => {
    if (!patInput.trim()) return
    setPatSaving(true)
    setPatError(null)
    try {
      const result = await api().invoke('github:store-pat', patInput.trim()) as { ok: boolean; error?: string }
      if (result.ok) {
        setShowPatInput(false)
        setPatInput('')
        // Re-check auth with stored PAT
        setAuthChecking(true)
        const newAuth = await api().invoke('github:check-auth') as AuthStatus
        setAuth(newAuth)
        setAuthError(null)
      } else {
        setPatError(result.error ?? 'PAT konnte nicht gespeichert werden')
      }
    } catch (err) {
      setPatError(err instanceof Error ? err.message : String(err))
    } finally {
      setPatSaving(false)
      setAuthChecking(false)
    }
  }

  const filteredRepos = repos.filter((r) =>
    repoSearch.trim()
      ? r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
        r.owner.toLowerCase().includes(repoSearch.toLowerCase())
      : true,
  )

  return (
    <div style={styles.container}>
      <div style={styles.heading}>GitHub-Anbindung</div>
      <div style={styles.subtext}>Optional — kann jederzeit übersprungen werden.</div>

      {/* Auth status */}
      <div style={styles.authBox}>
        {authChecking && <span style={styles.hint}>Prüfe GitHub-Authentifizierung…</span>}

        {!authChecking && authError && (
          <div style={styles.authError}>
            <div style={styles.authErrorMsg}>GitHub nicht erreichbar: {authError}</div>
            <div style={styles.authLinks}>
              gh-CLI installieren:{' '}
              <span style={styles.link}>cli.github.com</span>
            </div>
            <button
              style={styles.patBtn}
              onClick={() => setShowPatInput(!showPatInput)}
            >
              PAT (Personal Access Token) eingeben
            </button>
          </div>
        )}

        {!authChecking && auth && !auth.ghInstalled && (
          <div style={styles.authWarning}>
            <div>gh-CLI nicht gefunden.</div>
            <div style={styles.authLinks}>
              Installieren: <span style={styles.link}>cli.github.com</span>
            </div>
            <button
              style={styles.patBtn}
              onClick={() => setShowPatInput(!showPatInput)}
            >
              PAT eingeben
            </button>
          </div>
        )}

        {!authChecking && auth?.ghInstalled && !auth.authenticated && (
          <div style={styles.authWarning}>
            <div>gh-CLI gefunden, aber nicht eingeloggt.</div>
            <button
              style={styles.patBtn}
              onClick={() => setShowPatInput(!showPatInput)}
            >
              PAT eingeben
            </button>
          </div>
        )}

        {!authChecking && auth?.authenticated && (
          <div style={styles.authOk}>
            ✓ Eingeloggt als <strong>{auth.username}</strong>
          </div>
        )}

        {showPatInput && (
          <div style={styles.patRow}>
            <input
              style={styles.patInput}
              type="password"
              placeholder="ghp_… oder github_pat_…"
              value={patInput}
              onChange={(e) => setPatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePat()}
            />
            <button
              style={patSaving ? styles.patSaveBtnDisabled : styles.patSaveBtn}
              onClick={handleSavePat}
              disabled={patSaving}
            >
              {patSaving ? 'Speichere…' : 'Speichern'}
            </button>
            {patError && <div style={styles.patError}>{patError}</div>}
          </div>
        )}
      </div>

      {/* Three options */}
      <div style={styles.optionGroup}>
        {/* Skip */}
        <label style={styles.optionRow}>
          <input
            type="radio"
            name="githubAction"
            value="skip"
            checked={data.githubAction === 'skip'}
            onChange={() => onChange({ githubAction: 'skip' })}
            style={styles.radio}
          />
          <div>
            <div style={styles.optionTitle}>Überspringen</div>
            <div style={styles.optionDesc}>Kein GitHub-Repo für dieses Projekt.</div>
          </div>
        </label>

        {/* Create new repo */}
        <label style={styles.optionRow}>
          <input
            type="radio"
            name="githubAction"
            value="create"
            checked={data.githubAction === 'create'}
            onChange={() =>
              onChange({
                githubAction: 'create',
                githubRepoName: data.githubRepoName ?? data.projectName,
              })
            }
            style={styles.radio}
          />
          <div>
            <div style={styles.optionTitle}>Neues Repo anlegen</div>
            <div style={styles.optionDesc}>Erstellt ein neues Repository auf GitHub.</div>
          </div>
        </label>

        {data.githubAction === 'create' && (
          <div style={styles.subForm}>
            <label style={styles.fieldLabel}>Repo-Name</label>
            <input
              style={styles.input}
              type="text"
              value={data.githubRepoName ?? data.projectName}
              onChange={(e) => onChange({ githubRepoName: e.target.value })}
            />
            <label style={styles.fieldLabel}>Beschreibung (optional)</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Kurze Beschreibung…"
              value={data.githubRepoDesc ?? ''}
              onChange={(e) => onChange({ githubRepoDesc: e.target.value })}
            />
            <div style={styles.visibilityRow}>
              <label style={styles.radioInline}>
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={(data.githubVisibility ?? 'private') === 'private'}
                  onChange={() => onChange({ githubVisibility: 'private' })}
                />
                <span>Privat</span>
              </label>
              <label style={styles.radioInline}>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={data.githubVisibility === 'public'}
                  onChange={() => onChange({ githubVisibility: 'public' })}
                />
                <span>Öffentlich</span>
              </label>
            </div>
          </div>
        )}

        {/* Link existing repo */}
        <label style={styles.optionRow}>
          <input
            type="radio"
            name="githubAction"
            value="link"
            checked={data.githubAction === 'link'}
            onChange={() => onChange({ githubAction: 'link' })}
            style={styles.radio}
          />
          <div>
            <div style={styles.optionTitle}>Bestehendes Repo verlinken</div>
            <div style={styles.optionDesc}>Verbindet das Projekt mit einem vorhandenen GitHub-Repo.</div>
          </div>
        </label>

        {data.githubAction === 'link' && (
          <div style={styles.subForm}>
            {reposLoading && <div style={styles.hint}>Lade Repos…</div>}
            {reposError && <div style={styles.reposError}>{reposError}</div>}

            {repos.length > 0 && (
              <>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Suche…"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                />
                <div style={styles.repoList}>
                  {filteredRepos.slice(0, 50).map((r) => (
                    <div
                      key={`${r.owner}/${r.name}`}
                      style={
                        data.githubOwnerRepo === `${r.owner}/${r.name}`
                          ? styles.repoItemSelected
                          : styles.repoItem
                      }
                      onClick={() => onChange({ githubOwnerRepo: `${r.owner}/${r.name}` })}
                    >
                      <span style={styles.repoName}>{r.owner}/{r.name}</span>
                      <span style={styles.repoVisibility}>{r.visibility}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <label style={styles.fieldLabel}>Oder URL / owner/repo direkt eingeben</label>
            <input
              style={styles.input}
              type="text"
              placeholder="z.B. cipher/mein-projekt"
              value={data.githubOwnerRepo ?? ''}
              onChange={(e) => onChange({ githubOwnerRepo: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

const font = "'JetBrains Mono', 'Fira Code', monospace"

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
    maxWidth: 560,
  },
  heading: {
    fontSize: 15,
    color: '#90d090',
    fontFamily: font,
    fontWeight: 600 as const,
    marginBottom: 2,
  },
  subtext: {
    color: '#555',
    fontFamily: font,
    fontSize: 11,
    marginBottom: 4,
  },
  authBox: {
    padding: '10px 12px',
    background: '#111',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
  },
  authOk: {
    color: '#90d090',
    fontFamily: font,
    fontSize: 12,
  },
  authWarning: {
    color: '#c08040',
    fontFamily: font,
    fontSize: 12,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
  },
  authError: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
  },
  authErrorMsg: {
    color: '#e05050',
    fontFamily: font,
    fontSize: 12,
  },
  authLinks: {
    color: '#555',
    fontFamily: font,
    fontSize: 11,
  },
  link: {
    color: '#5090d0',
    textDecoration: 'underline' as const,
    cursor: 'pointer',
  },
  patBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#888',
    fontFamily: font,
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
  },
  patRow: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
    marginTop: 4,
  },
  patInput: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
  },
  patSaveBtn: {
    background: '#1e3a1e',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    color: '#90d090',
    fontFamily: font,
    fontSize: 12,
    padding: '5px 14px',
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
  },
  patSaveBtnDisabled: {
    background: '#111',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    color: '#333',
    fontFamily: font,
    fontSize: 12,
    padding: '5px 14px',
    cursor: 'not-allowed' as const,
    alignSelf: 'flex-start' as const,
  },
  patError: {
    color: '#e05050',
    fontFamily: font,
    fontSize: 11,
  },
  optionGroup: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
  },
  optionRow: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: '8px 10px',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    cursor: 'pointer',
    background: '#111',
    fontFamily: font,
  },
  radio: {
    accentColor: '#90d090',
    marginTop: 2,
    flexShrink: 0,
  },
  optionTitle: {
    color: '#e0e0e0',
    fontSize: 13,
    fontFamily: font,
  },
  optionDesc: {
    color: '#555',
    fontSize: 11,
    fontFamily: font,
    marginTop: 2,
  },
  subForm: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
    marginLeft: 28,
    marginTop: 2,
    padding: '10px 12px',
    background: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 4,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 11,
    fontFamily: font,
    letterSpacing: '0.04em',
  },
  input: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  visibilityRow: {
    display: 'flex' as const,
    gap: 16,
    alignItems: 'center' as const,
  },
  radioInline: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 12,
    cursor: 'pointer',
  },
  repoList: {
    maxHeight: 160,
    overflowY: 'auto' as const,
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    background: '#0d0d0d',
  },
  repoItem: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: font,
    fontSize: 12,
    color: '#888',
    borderBottom: '1px solid #111',
  },
  repoItemSelected: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: font,
    fontSize: 12,
    color: '#90d090',
    background: '#0d1a0d',
    borderBottom: '1px solid #111',
  },
  repoName: {
    flex: 1,
  },
  repoVisibility: {
    color: '#444',
    fontSize: 10,
    fontFamily: font,
    marginLeft: 8,
  },
  reposError: {
    color: '#e05050',
    fontFamily: font,
    fontSize: 11,
  },
  hint: {
    color: '#555',
    fontFamily: font,
    fontSize: 11,
  },
} as const
