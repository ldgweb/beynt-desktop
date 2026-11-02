import { useState } from 'react'
import { beynt, errorText } from '../../api'
import { useAccountStore } from '../../store/account'
import { useLibraryStore } from '../../store/library'
import { useWorkspaceStore } from '../../store/workspace'
import { useI18n } from '../../i18n'
import { IconExternal } from '../Sidebar/icons'

/**
 * The window until Beynt is connected: without an access key the app has nothing to show, so it
 * asks for one first, in three steps. The key is checked on Beynt before it is kept.
 */
export function Onboarding() {
  const { text } = useI18n()
  // Shown once the account was read: the address is Beynt's, or the one used last.
  const [baseUrl, setBaseUrl] = useState(() => useAccountStore.getState().baseUrl)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const connect = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      await beynt.account.connect(token.trim(), baseUrl.trim())
      // The whole library, not the Settings or the stack left open by a previous account; it shows
      // "Loading…" until the first copy arrives, instead of an empty list.
      useWorkspaceStore.getState().showLibrary('all')
      void useLibraryStore.getState().refresh()
      await useAccountStore.getState().refresh()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  // The site by its address: beynt.com is what people know.
  const site = baseUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'beynt.com'
  const openKeys = (): void => { beynt.account.openKeys(baseUrl.trim()).catch((failure: unknown) => setError(errorText(failure))) }

  return (
    <main className="onboarding">
      <form className="onboarding__card" onSubmit={(e) => { e.preventDefault(); if (token.trim() && !busy) void connect() }}>
        <div>
          <h1 className="onboarding__title">{text('Welcome', 'Ti diamo il benvenuto')}</h1>
          <p className="onboarding__lead">{text(`Connect your ${site} account in three steps.`, `Collega il tuo account ${site} in tre passi.`)}</p>
        </div>
        <ol className="onboarding__steps">
          <li>
            <button type="button" className="btn" onClick={openKeys}><IconExternal size={14} />{text(`Create a key on ${site}`, `Crea una chiave su ${site}`)}</button>
            <span className="hint">{text('Choose ', 'Scegli ')}<strong>Find work only</strong></span>
          </li>
          <li>
            <input className="input input--mono" type="password" autoComplete="off" spellCheck={false} autoFocus
              placeholder={text('Paste the key', 'Incolla la chiave')} aria-label={text('Access key', 'Chiave di accesso')}
              value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} />
          </li>
          <li>
            <button type="submit" className="btn btn--primary" disabled={busy || !token.trim()}>
              {busy ? text('Connecting…', 'Collegamento…') : text('Connect', 'Collega')}
            </button>
          </li>
        </ol>
        {error && <p className="error-text" role="alert">{error}</p>}
        {/* Development builds connect to a Beynt on this computer; people only ever use beynt.com. */}
        {import.meta.env.DEV && (
          <details className="onboarding__address">
            <summary>{text('Beynt address (development)', 'Indirizzo di Beynt (sviluppo)')}</summary>
            <input className="input" type="url" spellCheck={false} aria-label={text('Beynt address', 'Indirizzo di Beynt')}
              value={baseUrl} disabled={busy} onChange={(e) => setBaseUrl(e.target.value)} />
          </details>
        )}
      </form>
    </main>
  )
}
