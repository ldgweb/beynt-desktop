import { useEffect, useMemo, useState } from 'react'
import type { UpdateInfo } from '../../types'
import { beynt, errorText } from '../../api'
import { useWorkspaceStore } from '../../store/workspace'
import { useLibraryStore } from '../../store/library'
import { useAccountStore } from '../../store/account'
import { toast } from '../../store/toasts'
import { IconLibrary, IconSettings, IconStar } from './icons'
import { useI18n } from '../../i18n'

/** A newer version, found by the Rust side: one click installs it and the app starts again on it. */
function UpdateNotice() {
  const { text } = useI18n()
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  useEffect(() => {
    void beynt.update.status().then(setUpdate)
    return beynt.update.onAvailable(setUpdate)
  }, [])
  if (!update) return null
  const install = (): void => {
    setInstalling(true)
    beynt.update.install().catch((error: unknown) => {
      setInstalling(false)
      toast(errorText(error), 'error')
    })
  }
  return (
    <div className="sidebar__update" role="status">
      <span>{text(`Version ${update.version} is ready`, `È pronta la versione ${update.version}`)}</span>
      <button className="btn btn--small" disabled={installing} onClick={install}>
        {installing ? text('Installing…', 'Installo…') : text('Install', 'Installa')}
      </button>
    </div>
  )
}

/** Navigation, plus the favorites and the stacks as filters of the library. */
export function Sidebar() {
  const { t, text } = useI18n()
  const { surface, setSurface, stack, showLibrary } = useWorkspaceStore()
  const items = useLibraryStore((s) => s.library.items)
  const favorites = useLibraryStore((s) => s.favorites)
  const account = useAccountStore()
  const stacks = useMemo(() => {
    const counts = new Map<number, { name: string; count: number }>()
    for (const item of items) counts.set(item.stackId, { name: item.stackName, count: (counts.get(item.stackId)?.count ?? 0) + 1 })
    return [...counts.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [items])
  // Favorites of items that are gone stay saved, but are not counted.
  const pinned = useMemo(() => items.filter((item) => favorites.includes(item.id)).length, [items, favorites])
  const host = account.baseUrl.replace(/^https?:\/\//, '')

  return (
    <nav className="sidebar" aria-label={text('Navigation', 'Navigazione')}>
      <button className={`sidebar__item ${surface === 'library' && stack === 'all' ? 'is-active' : ''}`}
        aria-current={surface === 'library' ? 'page' : undefined} onClick={() => showLibrary('all')}>
        <IconLibrary size={16} /><span className="sidebar__label">{t('nav.library')}</span>
        <span className="sidebar__count">{items.length || ''}</span>
      </button>
      {(pinned > 0 || stack === 'favorites') && (
        <button className={`sidebar__item ${surface === 'library' && stack === 'favorites' ? 'is-active' : ''}`} onClick={() => showLibrary('favorites')}>
          <IconStar size={16} /><span className="sidebar__label">{text('Favorites', 'Preferiti')}</span>
          <span className="sidebar__count">{pinned || ''}</span>
        </button>
      )}
      {stacks.map(([id, entry]) => (
        <button key={id} className={`sidebar__item sidebar__sub ${surface === 'library' && stack === id ? 'is-active' : ''}`} onClick={() => showLibrary(id)}>
          <span className="sidebar__label">{entry.name}</span>
          <span className="sidebar__count">{entry.count}</span>
        </button>
      ))}
      <span className="sidebar__spacer" />
      <UpdateNotice />
      <button className={`sidebar__item ${surface === 'settings' ? 'is-active' : ''}`} aria-current={surface === 'settings' ? 'page' : undefined} onClick={() => setSurface('settings')}>
        <IconSettings size={16} /><span className="sidebar__label">{t('nav.settings')}</span>
      </button>
      <div className="sidebar__account" title={account.connected ? account.baseUrl : undefined}>
        <span className={`dot ${account.connected ? 'is-on' : ''}`} />
        {account.connected ? host : text('Not connected', 'Non connesso')}
      </div>
    </nav>
  )
}
