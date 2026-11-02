import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PaletteStatus, StartupStatus } from '../../types'
import { beynt, errorText } from '../../api'
import { useWorkspaceStore, type SettingsSection } from '../../store/workspace'
import { useAccountStore } from '../../store/account'
import { useSettingsStore, type AppTheme } from '../../store/settings'
import { useAppVersion } from '../../hooks/useAppVersion'
import { IconAccount, IconAppearance, IconTerminal } from '../Sidebar/icons'
import { useI18n } from '../../i18n'
import { acceleratorFor, keyLabel } from '../../core/commands'
import { isMac, isWindows } from '../../platform'

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field__label">{label}{hint && <small>{hint}</small>}</div>
      <div className="field__control">{children}</div>
    </div>
  )
}

/** The connection in use; disconnecting brings the window back to connecting Beynt. */
function AccountSection() {
  const { text } = useI18n()
  const baseUrl = useAccountStore((s) => s.baseUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const disconnect = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      await beynt.account.disconnect()
      await useAccountStore.getState().refresh()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section__title">{text('Beynt account', 'Account Beynt')}</h2>
      <Field label={text('Connected to', 'Collegato a')} hint={text('The library holds the stacks this key can reach.', 'La libreria contiene gli stack che questa chiave raggiunge.')}>
        <span className="dot is-on" /><span className="field__grow">{baseUrl.replace(/^https?:\/\//, '')}</span>
        <button className="btn btn--small" disabled={busy} onClick={() => void disconnect()}>{text('Disconnect', 'Scollega')}</button>
      </Field>
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  )
}

function AppearanceSection() {
  const { t, text } = useI18n()
  const s = useSettingsStore()
  const themes: { id: AppTheme; label: string }[] = [
    { id: 'auto', label: text('Automatic', 'Automatico') },
    { id: 'dark', label: text('Dark', 'Scuro') },
    { id: 'light', label: text('Light', 'Chiaro') }
  ]
  return (
    <section className="section">
      <h2 className="section__title">{t('settings.appearance')}</h2>
      <Field label={t('appearance.theme')} hint={text('Automatic follows the system.', 'Automatico segue il sistema.')}>
        <div className="segmented" role="radiogroup" aria-label={t('appearance.theme')}>
          {themes.map((theme) => (
            <button key={theme.id} role="radio" aria-checked={s.theme === theme.id} aria-pressed={s.theme === theme.id} onClick={() => s.setTheme(theme.id)}>{theme.label}</button>
          ))}
        </div>
      </Field>
      <Field label={t('appearance.language')} hint={t('appearance.language.hint')}>
        <select className="select" value={s.language} onChange={(e) => s.setLanguage(e.target.value as typeof s.language)}>
          <option value="auto">{t('appearance.language.auto')}</option>
          <option value="en">{t('appearance.language.en')}</option>
          <option value="it">{t('appearance.language.it')}</option>
        </select>
      </Field>
    </section>
  )
}

function StartupSection() {
  const { text } = useI18n()
  const [startup, setStartup] = useState<StartupStatus | null>(null)
  const [shortcut, setShortcut] = useState<PaletteStatus | null>(null)
  const [recording, setRecording] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    void beynt.app.getStartup().then(setStartup)
    void beynt.palette.status().then(setShortcut)
  }, [])
  const label = (accelerator: string): string => keyLabel(accelerator, { mac: isMac, space: text('Space', 'Spazio') })
  const startupLabel = isWindows ? text('Start with Windows', 'Avvia con Windows') : text('Open at login', 'Apri all’accesso')
  // On the focused button, so the app's own shortcuts (⌘/Ctrl+1, ⌘/Ctrl+F…) don't fire while recording.
  const record = (e: KeyboardEvent<HTMLButtonElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return setRecording(false)
    const accelerator = acceleratorFor(e.nativeEvent, isMac)
    if (!accelerator) {
      if (!['Control', 'Alt', 'AltGraph', 'Shift', 'Meta'].includes(e.key)) setNote(isMac
        ? text('Use ⌘, ⌃ or ⌥ with a letter, a digit, Space or an F key.', 'Usa ⌘, ⌃ o ⌥ con una lettera, una cifra, Spazio o un tasto F.')
        : text('Use Ctrl or Alt with a letter, a digit, Space or an F key.', 'Usa Ctrl o Alt con una lettera, una cifra, Spazio o un tasto F.'))
      return
    }
    setRecording(false)
    void beynt.palette.setShortcut(accelerator).then((result) => {
      setShortcut(result)
      setNote(result.taken ? text(`Another app already uses ${label(accelerator)}.`, `Un’altra app usa già ${label(accelerator)}.`) : null)
    })
  }
  return (
    <section className="section">
      <h2 className="section__title">{text('Start-up and shortcut', 'Avvio e scorciatoia')}</h2>
      <Field label={startupLabel} hint={startup && !startup.available
        ? text('Only for the installed app.', 'Solo per l’app installata.')
        : isMac
          ? text('Beynt starts in the menu bar, so the shortcut works right away.', 'Beynt parte nella barra dei menu, così la scorciatoia funziona subito.')
          : text('Beynt starts in the tray, so the shortcut works right away.', 'Beynt parte nel tray, così la scorciatoia funziona subito.')}>
        <button className="toggle" role="switch" aria-checked={!!startup?.enabled} disabled={!startup?.available}
          aria-label={startupLabel}
          onClick={() => void beynt.app.setStartup(!startup?.enabled).then(setStartup)} />
      </Field>
      <Field label={text('Search', 'Ricerca')} hint={note
        ? <span className="error-text">{note}</span>
        : shortcut && !shortcut.registered
          ? <span className="error-text">{shortcut.launchCommand
            ? <>{text(
              'The desktop did not allow it: another app may use it, or on Wayland shortcuts are set in the system settings. There you can bind a shortcut to this command: ',
              'Il desktop non l’ha permessa: forse la usa un’altra app, oppure su Wayland le scorciatoie si impostano nelle impostazioni di sistema. Lì puoi assegnare una scorciatoia a questo comando: '
            )}<code>{shortcut.launchCommand}</code></>
            : text('Another app already uses it: choose another one.', 'Un’altra app la usa già: scegline un’altra.')}</span>
          : shortcut?.launchCommand
            // On Wayland the desktop can drop a registered shortcut without telling the app: always offer the command.
            ? <>{text(
              'From any app: type, Enter, paste. If the shortcut does nothing (on Wayland the desktop decides), bind a shortcut to this command in the system settings: ',
              'Da qualsiasi app: scrivi, Invio, incolla. Se la scorciatoia non fa nulla (su Wayland decide il desktop), assegnane una a questo comando nelle impostazioni di sistema: '
            )}<code>{shortcut.launchCommand}</code></>
            : text('From any app: type, Enter, paste a command or read a note.', 'Da qualsiasi app: scrivi, Invio, incolla un comando o leggi una nota.')}>
        <kbd className="tag">{recording ? text('Press the keys…', 'Premi i tasti…') : shortcut && label(shortcut.shortcut)}</kbd>
        <button className="btn btn--small" onKeyDown={recording ? record : undefined} onBlur={() => setRecording(false)}
          onClick={() => { setNote(null); setRecording(true) }}>
          {recording ? text('Esc to cancel', 'Esc per annullare') : text('Change', 'Cambia')}
        </button>
      </Field>
      <Field label={text('Closing the window', 'Chiudere la finestra')} hint={isMac
        ? text('Beynt keeps running in the menu bar. Quit with ⌘Q.', 'Beynt resta attivo nella barra dei menu. Per uscire: ⌘Q.')
        : text('Beynt stays in the tray. Quit from the tray icon or File → Quit.', 'Beynt resta nel tray. Per uscire: icona nel tray o File → Esci.')}>
        <span />
      </Field>
    </section>
  )
}

export function SettingsPanel() {
  const { t, text } = useI18n()
  const active = useWorkspaceStore((s) => s.settingsSection)
  const setActive = useWorkspaceStore((s) => s.setSettingsSection)
  const version = useAppVersion()
  const tabs: { id: SettingsSection; label: string; icon: ReactNode; render: () => ReactNode }[] = [
    { id: 'account', label: 'Account', icon: <IconAccount size={15} />, render: () => <AccountSection /> },
    { id: 'startup', label: text('Start-up', 'Avvio'), icon: <IconTerminal size={15} />, render: () => <StartupSection /> },
    { id: 'appearance', label: t('settings.appearance'), icon: <IconAppearance size={15} />, render: () => <AppearanceSection /> }
  ]
  const tab = tabs.find((entry) => entry.id === active) ?? tabs[0]

  return (
    <div className="main">
      <header className="page-header"><h1 className="page-header__title">{t('settings.title')}</h1></header>
      <div className="settings">
        <nav className="settings__nav" aria-label={t('settings.sections')}>
          {tabs.map((item) => (
            <button key={item.id} className={`sidebar__item ${tab.id === item.id ? 'is-active' : ''}`} aria-current={tab.id === item.id ? 'page' : undefined} onClick={() => setActive(item.id)}>
              {item.icon}<span className="sidebar__label">{item.label}</span>
            </button>
          ))}
          <span className="settings__version">Beynt {version ? `v${version}` : ''}</span>
        </nav>
        <div className="settings__content"><div className="settings__inner">{tab.render()}</div></div>
      </div>
    </div>
  )
}
