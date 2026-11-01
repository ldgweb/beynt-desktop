import { useEffect, useMemo, useRef, useState } from 'react'
import { COMMAND_TYPES, type BeyntCommand, type BeyntItem, type ItemType, type PaletteStatus } from '../../types'
import { beynt } from '../../api'
import { actionForKey, actionsFor, byFolder, cap, home, keyLabel as formatKeys, placeholders, search, type Group, type ItemAction } from '../../core/commands'
import { copyCommand, runItemAction, useLibraryStore, useRank } from '../../store/library'
import { useAccountStore } from '../../store/account'
import { useWorkspaceStore } from '../../store/workspace'
import { useNoteSearch } from '../../hooks/useNoteSearch'
import { toast } from '../../store/toasts'
import { useI18n } from '../../i18n'
import { IconExternal, IconLibrary, IconSearch, IconStar, IconSync } from '../Sidebar/icons'
import { hasModifier, isMac } from '../../platform'
import { actionKeys, FillFields, GroupLabel, ItemRow, TypeMark, useActionLabel, useTypeLabel } from './parts'

const SHOWN = 300
const TYPES: ItemType[] = [...COMMAND_TYPES, 'note']
// Actions with a place of their own in the detail: the fields and their Copy buttons.
const IN_FIELDS: ItemAction[] = ['fill', 'copy', 'copyRaw']

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function Detail({ item, favorite, onRun, onCopy, fillFocus }: { item: BeyntItem | undefined; favorite: boolean; onRun: (action: ItemAction, item: BeyntItem) => void; onCopy: (command: BeyntCommand, text: string) => void; fillFocus: number }) {
  const { text, language } = useI18n()
  const typeLabel = useTypeLabel()
  const actionLabel = useActionLabel()
  if (!item) return <aside className="detail"><p className="detail__empty">{text('Select an item to see it here.', 'Seleziona un elemento per vederlo qui.')}</p></aside>
  const actions = actionsFor(item)
  const others = actions.filter((action, index) => index > 0 && !IN_FIELDS.includes(action))
  return (
    <aside className="detail" aria-label={text('Selected item', 'Elemento selezionato')}>
      <div>
        <h2 className="detail__title">{item.title}</h2>
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
        {others.map((action) => {
          const keys = actionKeys(action, actions.indexOf(action))
          return (
            <button key={action} className="btn btn--quiet btn--small" title={keys ?? undefined}
              aria-pressed={action === 'favorite' ? favorite : undefined} onClick={() => onRun(action, item)}>
              {action === 'favorite' && <IconStar size={13} filled={favorite} />}{actionLabel(action, favorite)}
            </button>
          )
        })}
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

export function LibraryPanel() {
  const { t, text, language } = useI18n()
  const typeLabel = useTypeLabel()
  const { library, loaded, refreshing, error, favorites } = useLibraryStore()
  const rank = useRank()
  const connected = useAccountStore((s) => s.connected)
  const stack = useWorkspaceStore((s) => s.stack)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ItemType | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [fillFocus, setFillFocus] = useState(0)
  const [shortcut, setShortcut] = useState<PaletteStatus | null>(null)
  const searchBox = useRef<HTMLInputElement>(null)
  const rows = useRef<HTMLUListElement>(null)

  useEffect(() => { void beynt.palette.status().then(setShortcut) }, [])
  useEffect(() => {
    const focus = (): void => searchBox.current?.focus()
    window.addEventListener('beynt:find', focus)
    return () => window.removeEventListener('beynt:find', focus)
  }, [])

  const inStack = useMemo(() => library.items.filter((item) =>
    stack === 'all' || (stack === 'favorites' ? favorites.includes(item.id) : item.stackId === stack)), [library.items, stack, favorites])
  const ofType = useMemo(() => inStack.filter((item) => type === 'all' || item.type === type), [inStack, type])
  const found = useMemo(() => search(ofType, query, rank), [ofType, query, rank])
  const hits = useNoteSearch(query, typeof stack === 'number' ? stack : undefined, stack !== 'favorites' && (type === 'all' || type === 'note'))
  const groups = useMemo((): Group<BeyntItem>[] => {
    if (query.trim()) {
      const shown = new Set(found.map((item) => item.id))
      return cap([
        { label: null, items: found },
        { label: text('In the text of notes', 'Nel testo delle note'), items: hits.filter((hit) => !shown.has(hit.id)) }
      ], SHOWN)
    }
    // A stack reads like its folders on Beynt; everything starts from favorites and recent uses.
    if (typeof stack === 'number') return cap(byFolder(ofType), SHOWN)
    if (stack === 'favorites') return cap([{ label: null, items: found }], SHOWN)
    const [pinned, recent, rest] = home(ofType, favorites, rank)
    return cap([
      { label: text('Favorites', 'Preferiti'), items: pinned },
      { label: text('Recent', 'Recenti'), items: recent },
      { label: pinned.length || recent.length ? text('All', 'Tutti') : null, items: rest }
    ], SHOWN)
  }, [query, found, hits, stack, ofType, favorites, rank, text, language])
  const results = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const selected = results.find((item) => item.id === selectedId) ?? results[0]
  const title = stack === 'favorites' ? text('Favorites', 'Preferiti') : typeof stack === 'number' ? inStack[0]?.stackName : null

  useEffect(() => { rows.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' }) }, [selected?.id])

  const copy = (command: BeyntCommand, value: string): void => {
    copyCommand(command, value).then(
      () => toast(text('Copied — paste it where you need it', 'Copiato — incollalo dove ti serve'), 'success'),
      (error: unknown) => toast(message(error), 'error')
    )
  }
  const run = (action: ItemAction, item: BeyntItem): void => {
    if (action === 'fill') { setFillFocus((n) => n + 1); return }
    runItemAction(action, item).then(
      (done) => { if (done === 'copied') toast(text('Copied — paste it where you need it', 'Copiato — incollalo dove ti serve'), 'success') },
      (error: unknown) => toast(message(error), 'error')
    )
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
        <button className="btn btn--quiet btn--small" disabled={!connected || refreshing} onClick={() => void useLibraryStore.getState().refresh()} title={text('Update from Beynt', 'Aggiorna da Beynt')}>
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
            <div className="segmented" role="group" aria-label={text('Type', 'Tipo')}>
              <button aria-pressed={type === 'all'} onClick={() => setType('all')}>{text('All', 'Tutti')}</button>
              {TYPES.map((entry) => (
                <button key={entry} aria-pressed={type === entry} onClick={() => setType(entry)}><TypeMark type={entry} />{typeLabel(entry)}</button>
              ))}
            </div>
          </div>

          {!connected && (
            <div className="notice notice--inset">
              <p>{text('Connect Beynt to load your library. What is already loaded works offline.', 'Collega Beynt per caricare la tua libreria. Quello che è già caricato funziona anche offline.')}</p>
              <button className="btn btn--small" onClick={() => useWorkspaceStore.getState().openAccount()}>{text('Connect', 'Collega')}</button>
            </div>
          )}
          {shortcut && !shortcut.registered && <p className="library__status error-text">{shortcut.launchCommand
            ? text('The search shortcut is not active: see Settings → Start-up.', 'La scorciatoia della ricerca non è attiva: vedi Impostazioni → Avvio.')
            : text(`Another app already uses ${keyLabel}: change it in Settings.`, `Un’altra app usa già ${keyLabel}: cambiala in Impostazioni.`)}</p>}
          {error && <p className="library__status error-text">{text('Update failed, showing the saved copy: ', 'Aggiornamento non riuscito, mostro la copia salvata: ')}{error}</p>}
          <p className="library__status">
            {query || type !== 'all' ? text(`${found.length} of ${inStack.length}`, `${found.length} di ${inStack.length}`) : t('library.count', { count: inStack.length })}
            {library.syncedAt && <> · {text('updated ', 'aggiornata alle ')}{new Date(library.syncedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}</>}
          </p>

          {loaded && library.items.length === 0 && connected && !refreshing ? (
            <div className="empty">
              <IconLibrary size={22} />
              <h2>{text('Nothing here yet', 'Ancora niente qui')}</h2>
              <p>{text('Save a command, query, config, prompt or note in a Beynt stack, from the site or your AI app, then update.', 'Salva un comando, una query, una config, un prompt o una nota in uno stack Beynt, dal sito o dalla tua app IA, poi aggiorna.')}</p>
              <button className="btn" onClick={() => void useLibraryStore.getState().refresh()}>{text('Update', 'Aggiorna')}</button>
            </div>
          ) : (
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
