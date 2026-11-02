import { useEffect, useRef, useState } from 'react'
import type { BeyntCommand, BeyntItem, PaletteStatus } from '../../types'
import { beynt, errorText } from '../../api'
import { actionForKey, actionsFor, keyLabel as formatKeys, placeholders, type ItemAction } from '../../core/commands'
import { copyCommand, runItemAction, useLibraryStore } from '../../store/library'
import { useWorkspaceStore } from '../../store/workspace'
import { useResults, type TypeFilter } from '../../hooks/useResults'
import { toast } from '../../store/toasts'
import { useI18n } from '../../i18n'
import { IconExternal, IconLibrary, IconSearch, IconStar, IconSync } from '../Sidebar/icons'
import { hasModifier, isMac } from '../../platform'
import { actionKeys, FillFields, GroupLabel, ItemRow, TypeFilterBar, TypeMark, useActionLabel, useTypeLabel } from './parts'

const SHOWN = 300
// Actions with a place of their own in the detail: the fields and their Copy buttons, the star by the title.
const PLACED: ItemAction[] = ['fill', 'copy', 'copyRaw', 'favorite']

function Detail({ item, favorite, onRun, onCopy, fillFocus }: { item: BeyntItem | undefined; favorite: boolean; onRun: (action: ItemAction, item: BeyntItem) => void; onCopy: (command: BeyntCommand, text: string) => void; fillFocus: number }) {
  const { text, language } = useI18n()
  const typeLabel = useTypeLabel()
  const actionLabel = useActionLabel()
  if (!item) return <aside className="detail"><p className="detail__empty">{text('Select an item to see it here.', 'Seleziona un elemento per vederlo qui.')}</p></aside>
  const actions = actionsFor(item)
  const others = actions.filter((action, index) => index > 0 && !PLACED.includes(action))
  const favoriteLabel = actionLabel('favorite', favorite)
  return (
    <aside className="detail" aria-label={text('Selected item', 'Elemento selezionato')}>
      <div>
        <div className="detail__head">
          <h2 className="detail__title">{item.title}</h2>
          <button className="btn btn--quiet btn--icon" aria-pressed={favorite} aria-label={favoriteLabel}
            title={`${favoriteLabel} (${actionKeys('favorite', actions.indexOf('favorite'))})`} onClick={() => onRun('favorite', item)}>
            <IconStar size={15} filled={favorite} />
          </button>
        </div>
        <div className="detail__meta">
          <span className="tag"><TypeMark type={item.type} />{typeLabel(item.type)}</span>
          <span className="tag">{item.stackName}</span>
          {item.verified && <span className="tag verified">{text('Verified', 'Verificato')}</span>}
          {item.tags.slice(0, 4).map((tag) => <span key={tag} className="tag">#{tag}</span>)}
        </div>
      </div>
      {item.type === 'note'
        ? (
          <div className="fill__actions">
            <button className="btn btn--primary" onClick={() => onRun('open', item)}><IconExternal size={14} />{text('Open on Beynt', 'Apri su Beynt')} <kbd>↵</kbd></button>
          </div>
        )
        : <FillFields key={`${item.id}:${fillFocus}`} command={item} autoFocus={placeholders(item.text).length > 0 && fillFocus > 0} onCopy={(value) => onCopy(item, value)} />}
      <div className="detail__actions">
        {others.map((action) => (
          <button key={action} className="btn btn--quiet btn--small" title={actionKeys(action, actions.indexOf(action)) ?? undefined} onClick={() => onRun(action, item)}>
            {actionLabel(action, favorite)}
          </button>
        ))}
      </div>
      {(item.path || item.updatedAt) && (
        <p className="hint">
          {item.path}{item.path && item.updatedAt && ' · '}
          {item.updatedAt && <>{text('changed ', 'modificato il ')}{new Date(item.updatedAt.replace(' ', 'T')).toLocaleDateString(language)}</>}
        </p>
      )}
    </aside>
  )
}

/** No items: still on their way from Beynt (right after connecting), or none saved yet. */
function EmptyLibrary({ loading }: { loading: boolean }) {
  const { text } = useI18n()
  if (loading) return <p className="hint library__none">{text('Loading your library from Beynt…', 'Carico la tua libreria da Beynt…')}</p>
  return (
    <div className="empty">
      <IconLibrary size={22} />
      <h2>{text('Nothing here yet', 'Ancora niente qui')}</h2>
      <p>{text('Save a command, query, config, prompt or note in a Beynt stack, from the site or your AI app, then update.', 'Salva un comando, una query, una config, un prompt o una nota in uno stack Beynt, dal sito o dalla tua app IA, poi aggiorna.')}</p>
      <button className="btn" onClick={() => void useLibraryStore.getState().refresh()}>{text('Update', 'Aggiorna')}</button>
    </div>
  )
}

export function LibraryPanel() {
  const { t, text, language } = useI18n()
  const { library, loaded, refreshing, error, favorites } = useLibraryStore()
  const stack = useWorkspaceStore((s) => s.stack)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [fillFocus, setFillFocus] = useState(0)
  const [shortcut, setShortcut] = useState<PaletteStatus | null>(null)
  const searchBox = useRef<HTMLInputElement>(null)
  const rows = useRef<HTMLUListElement>(null)
  const { groups, items: results, total, matched } = useResults(query, type, stack, SHOWN)

  useEffect(() => { void beynt.palette.status().then(setShortcut) }, [])
  useEffect(() => {
    const focus = (): void => searchBox.current?.focus()
    window.addEventListener('beynt:find', focus)
    return () => window.removeEventListener('beynt:find', focus)
  }, [])

  const selected = results.find((item) => item.id === selectedId) ?? results[0]
  const title = stack === 'favorites'
    ? text('Favorites', 'Preferiti')
    : typeof stack === 'number' ? library.items.find((item) => item.stackId === stack)?.stackName : undefined

  useEffect(() => { rows.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' }) }, [selected?.id])

  const copied = (): void => toast(text('Copied — paste it where you need it', 'Copiato — incollalo dove ti serve'), 'success')
  const failed = (failure: unknown): void => toast(errorText(failure), 'error')
  const copy = (command: BeyntCommand, value: string): void => { copyCommand(command, value).then(copied, failed) }
  const run = (action: ItemAction, item: BeyntItem): void => {
    if (action === 'fill') { setFillFocus((n) => n + 1); return }
    runItemAction(action, item).then((done) => { if (done === 'copied') copied() }, failed)
  }
  const move = (delta: number): void => {
    const index = Math.max(0, results.findIndex((item) => item.id === selected?.id))
    const next = results[Math.min(results.length - 1, Math.max(0, index + delta))]
    if (next) setSelectedId(next.id)
  }
  const keyLabel = shortcut && formatKeys(shortcut.shortcut, { mac: isMac, space: text('Space', 'Spazio') })

  return (
    <div className="main">
      <header className="page-header">
        <h1 className="page-header__title">{title ?? t('nav.library')}</h1>
        <span className="page-header__sub">{shortcut?.registered
          ? text(`${keyLabel} from any app`, `${keyLabel} da qualsiasi app`)
          : text('Commands, queries, configs, prompts and notes from your stacks', 'Comandi, query, config, prompt e note dei tuoi stack')}</span>
        <button className="btn btn--quiet btn--small" disabled={refreshing} onClick={() => void useLibraryStore.getState().refresh()} title={text('Update from Beynt', 'Aggiorna da Beynt')}>
          <IconSync size={14} />{refreshing ? text('Updating…', 'Aggiorno…') : text('Update', 'Aggiorna')}
        </button>
      </header>

      <div className="library">
        <section className="library__list">
          <div className="library__toolbar">
            <label className="search">
              <IconSearch size={14} />
              <input ref={searchBox} className="input" value={query} autoFocus spellCheck={false}
                placeholder={text('Search', 'Cerca')} aria-label={text('Search the library', 'Cerca nella libreria')}
                onChange={(e) => { setQuery(e.target.value); setSelectedId(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
                  else if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') }
                  else if (selected) {
                    const action = actionForKey({ key: e.key, mod: hasModifier(e), shiftKey: e.shiftKey, altKey: e.altKey }, actionsFor(selected))
                    if (action) { e.preventDefault(); run(action, selected) }
                  }
                }} />
              <kbd>{isMac ? '⌘F' : 'Ctrl F'}</kbd>
            </label>
            <TypeFilterBar value={type} onChange={(next) => { setType(next); setSelectedId(null) }} />
          </div>

          {shortcut && !shortcut.registered && <p className="library__status error-text">{shortcut.launchCommand
            ? text('The search shortcut is not active: see Settings → Start-up.', 'La scorciatoia della ricerca non è attiva: vedi Impostazioni → Avvio.')
            : text(`Another app already uses ${keyLabel}: change it in Settings.`, `Un’altra app usa già ${keyLabel}: cambiala in Impostazioni.`)}</p>}
          {error && <p className="library__status error-text">{text('Update failed, showing the saved copy: ', 'Aggiornamento non riuscito, mostro la copia salvata: ')}{error}</p>}
          <p className="library__status">
            {query || type !== 'all' ? text(`${matched} of ${total}`, `${matched} di ${total}`) : t('library.count', { count: total })}
            {library.syncedAt && <> · {text('updated ', 'aggiornata alle ')}{new Date(library.syncedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}</>}
          </p>

          {loaded && library.items.length === 0 ? <EmptyLibrary loading={refreshing} /> : (
            <ul ref={rows} className="library__rows rows" role="listbox" aria-label={t('nav.library')}>
              {groups.flatMap((group) => [
                group.label ? <GroupLabel key={`label:${group.label}`}>{group.label}</GroupLabel> : null,
                ...group.items.map((item) => (
                  <li key={item.id}>
                    <ItemRow item={item} selected={item.id === selected?.id} showStack={typeof stack !== 'number'} favorite={favorites.includes(item.id)}
                      onSelect={() => setSelectedId(item.id)} onChoose={() => run(actionsFor(item)[0], item)} />
                  </li>
                ))
              ])}
              {results.length === 0 && library.items.length > 0 && <li className="detail__empty library__none">{text('Nothing matches.', 'Nessun risultato.')}</li>}
            </ul>
          )}
        </section>
        <Detail item={selected} favorite={!!selected && favorites.includes(selected.id)} onRun={run} onCopy={copy} fillFocus={fillFocus} />
      </div>
    </div>
  )
}
