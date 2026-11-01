import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { beynt } from '../../api'
import { useWorkspaceStore } from '../../store/workspace'
import { runAction } from '../../actions'
import { useAppVersion } from '../../hooks/useAppVersion'
import { isMac, isWindows } from '../../platform'
import { BeyntLogo } from '../BeyntLogo/BeyntLogo'
import { useI18n } from '../../i18n'

const appWindow = getCurrentWindow()

interface MenuItem {
  label?: string
  hint?: string
  separator?: boolean
  /** Non-interactive row (version). */
  info?: boolean
  checked?: boolean
  onClick?: () => void
}

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button className={`menu__button ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="menu__list" role="menu">
          {items.map((it, i) => {
            if (it.separator) return <div key={i} className="menu__sep" role="separator" />
            if (it.info) return <div key={i} className="menu__info"><span>{it.label}</span>{it.hint && <span>{it.hint}</span>}</div>
            return (
              <button key={i} role="menuitem" className={`menu__item ${it.checked ? 'is-checked' : ''}`}
                onClick={() => { it.onClick?.(); setOpen(false) }}>
                <span>{it.label}</span>
                {it.hint && <span className="menu__hint">{it.hint}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Windows and Linux menus; on a Mac they live in the menu bar (src-tauri/src/menu.rs) and the bar keeps only the brand. */
function WindowMenus() {
  const { t } = useI18n()
  const surface = useWorkspaceStore((s) => s.surface)
  const version = useAppVersion()

  const fileItems: MenuItem[] = [
    { label: t('nav.settings'), hint: 'Ctrl+,', onClick: () => runAction('settings') },
    { separator: true },
    { label: t('menu.quit'), onClick: () => void beynt.app.quit() }
  ]

  const viewItems: MenuItem[] = [
    { label: t('nav.library'), hint: 'Ctrl+1', checked: surface === 'library', onClick: () => runAction('library') },
    { label: t('nav.settings'), hint: 'Ctrl+,', checked: surface === 'settings', onClick: () => runAction('settings') },
    { separator: true },
    { label: t('menu.search'), hint: 'Ctrl+F', onClick: () => runAction('find') }
  ]

  const helpItems: MenuItem[] = [
    { label: 'beynt.com', onClick: () => void beynt.openBeynt() },
    { separator: true },
    { label: `Beynt ${version ? `v${version}` : ''}`, info: true }
  ]

  return (
    <>
      <Menu label={t('menu.file')} items={fileItems} />
      <Menu label={t('menu.view')} items={viewItems} />
      <Menu label={t('menu.help')} items={helpItems} />
    </>
  )
}

/** Windows has no frame: the app draws minimize, maximize and close, as Windows 11 does. */
function WindowControls() {
  const { text } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const refresh = (): void => void appWindow.isMaximized().then(setMaximized)
    refresh()
    const stop = appWindow.onResized(refresh)
    return () => void stop.then((unlisten) => unlisten())
  }, [])

  return (
    <div className="window-controls">
      <button aria-label={text('Minimize', 'Riduci a icona')} title={text('Minimize', 'Riduci a icona')} onClick={() => void appWindow.minimize()}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" /></svg>
      </button>
      <button aria-label={maximized ? text('Restore', 'Ripristina') : text('Maximize', 'Ingrandisci')} title={maximized ? text('Restore', 'Ripristina') : text('Maximize', 'Ingrandisci')}
        onClick={() => void appWindow.toggleMaximize()}>
        <svg viewBox="0 0 10 10" aria-hidden="true">{maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}</svg>
      </button>
      <button className="window-controls__close" aria-label={text('Close', 'Chiudi')} title={text('Close (Beynt stays in the tray)', 'Chiudi (Beynt resta nel tray)')}
        onClick={() => void appWindow.close()}>
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0 0 10" /></svg>
      </button>
    </div>
  )
}

/** Empty areas drag the window; a double click maximizes it. */
export function TitleBar() {
  const { text } = useI18n()
  return (
    <header className="titlebar" data-tauri-drag-region>
      <button className="titlebar__brand" title="beynt.com" onClick={() => void beynt.openBeynt()}>
        <BeyntLogo height={18} />
        {import.meta.env.DEV && <span className="titlebar__dev" title={text('Development build · separate profile', 'Versione di sviluppo · profilo separato')}>DEV</span>}
      </button>
      {!isMac && <WindowMenus />}
      {isWindows && <WindowControls />}
    </header>
  )
}
