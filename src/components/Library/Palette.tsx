import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { BeyntCommand, BeyntItem } from '../../types'
import { beynt } from '../../api'
import { actionForKey, actionsFor, cap, home, search, type Group, type ItemAction } from '../../core/commands'
import { connectLibrary, copyCommand, runItemAction, useLibraryStore, useRank } from '../../store/library'
import { useNoteSearch } from '../../hooks/useNoteSearch'
import { useI18n } from '../../i18n'
import { hasModifier, isMac } from '../../platform'
import { IconCheck, IconSearch } from '../Sidebar/icons'
import { actionKeys, FillFields, GroupLabel, ItemRow, MarkedText, useActionLabel } from './parts'

const STALE_MS = 5 * 60_000
const SHOWN = 50

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The global-shortcut window: type, arrows, Enter. Enter runs an item's main action (a command is
 * on the clipboard, a note opens on the web), ⌘/Ctrl+Enter the second one, ⌘/Ctrl+K lists them all.
 */
export function Palette() {
  const { text, language } = useI18n()
  const actionLabel = useActionLabel()
  const library = useLibraryStore((s) => s.library)
  const favorites = useLibraryStore((s) => s.favorites)
  const rank = useRank()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [filling, setFilling] = useState<BeyntCommand | null>(null)
  // The open list of actions, and the one picked in it.
  const [picked, setPicked] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const hits = useNoteSearch(query)

  const groups = useMemo((): Group<BeyntItem>[] => {
    if (!query.trim()) {
      const [pinned, recent, rest] = home(library.items, favorites, rank)
      return cap([
        { label: text('Favorites', 'Preferiti'), items: pinned },
        { label: text('Recent', 'Recenti'), items: recent },
        { label: pinned.length || recent.length ? text('All', 'Tutti') : null, items: rest }
      ], SHOWN)
    }
    const found = search(library.items, query, rank).slice(0, SHOWN)
    const shown = new Set(found.map((item) => item.id))
    return cap([
      { label: null, items: found },
      { label: text('In the text of notes', 'Nel testo delle note'), items: hits.filter((hit) => !shown.has(hit.id)) }
    ], SHOWN * 2)
  }, [library.items, favorites, rank, query, hits, text, language])
  const results = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const current = results[selected] as BeyntItem | undefined
  const actions = current ? actionsFor(current) : []
  const isFavorite = (item: BeyntItem): boolean => favorites.includes(item.id)

  useEffect(connectLibrary, [])
  useEffect(() => beynt.palette.onOpened(() => {
    setQuery(''); setSelected(0); setFilling(null); setPicked(null); setCopied(false); setError(null)
    input.current?.focus()
    const { library: saved, refreshing } = useLibraryStore.getState()
    if (!refreshing && (!saved.syncedAt || Date.now() - saved.syncedAt > STALE_MS)) void useLibraryStore.getState().refresh()
  }), [])
  useEffect(() => { setSelected(0); setPicked(null); setError(null) }, [query])
  useEffect(() => { list.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' }) }, [selected])

  const fail = (failure: unknown): void => setError(message(failure))
  const showCopied = (): void => {
    setCopied(true)
    setTimeout(() => void beynt.palette.hide(), 350)
  }
  const run = (action: ItemAction, item: BeyntItem): void => {
    setPicked(null)
    if (action === 'fill') {
      if (item.type !== 'note') setFilling(item)
      return
    }
    runItemAction(action, item).then((done) => {
      if (done === 'copied') showCopied()
      else if (done === 'opened') void beynt.palette.hide()
    }, fail)
  }
  const back = (): void => { setFilling(null); setTimeout(() => input.current?.focus()) }

  if (copied) return <div className="palette palette--done" role="status"><IconCheck size={18} />{text('Copied', 'Copiato')}</div>

  if (filling) {
    return (
      <div className="palette" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); back() } }}>
        <div className="palette__fill">
          <h2 className="detail__title palette__title">{filling.title}</h2>
          <FillFields command={filling} autoFocus onCopy={(value) => copyCommand(filling, value).then(showCopied, fail)}
            footer={<button type="button" className="btn btn--quiet" onClick={back}>{text('Back', 'Indietro')}</button>} />
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
        <div className="palette__foot"><span><kbd>↵</kbd>{text('copy', 'copia')}</span><span><kbd>Esc</kbd>{text('back', 'indietro')}</span><span>{filling.stackName}</span></div>
      </div>
    )
  }

  const onKey = (e: KeyboardEvent): void => {
    const mod = hasModifier(e)
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setPicked((open) => (open === null && current ? 0 : null))
    } else if (picked !== null && current) {
      // The list of actions has the keys while it is open.
      if (e.key === 'Escape') { e.preventDefault(); setPicked(null) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setPicked((i) => Math.min((i ?? 0) + 1, actions.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setPicked((i) => Math.max((i ?? 0) - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); run(actions[picked], current) }
    } else if (e.key === 'Escape') { e.preventDefault(); void beynt.palette.hide() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)) }
    else if (current) {
      const action = actionForKey({ key: e.key, mod, shiftKey: e.shiftKey, altKey: e.altKey }, actions)
      if (action) { e.preventDefault(); run(action, current) }
    }
  }

  let index = -1
  return (
    <div className="palette" onKeyDown={onKey}>
      <label className="palette__search">
        <IconSearch size={18} />
        <input ref={input} className="palette__input" value={query} autoFocus spellCheck={false}
          placeholder={text('Search commands and notes', 'Cerca comandi e note')}
          aria-label={text('Search commands and notes', 'Cerca comandi e note')} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul ref={list} className="palette__rows rows" role="listbox">
        {groups.flatMap((group) => [
          group.label ? <GroupLabel key={`label:${group.label}`}>{group.label}</GroupLabel> : null,
          ...group.items.map((item) => {
            const position = ++index
            return (
              // While the actions are open, they belong to the selected row.
              <li key={item.id} onMouseMove={() => { if (picked === null) setSelected(position) }}>
                <ItemRow item={item} selected={position === selected} showStack favorite={isFavorite(item)}
                  onSelect={() => run(actionsFor(item)[0], item)} onChoose={() => run(actionsFor(item)[0], item)} />
              </li>
            )
          })
        ])}
        {results.length === 0 && (
          <li className="palette__empty">{library.items.length === 0
            ? text('Nothing yet: connect Beynt in the app.', 'Ancora niente: collega Beynt nell’app.')
            : text('Nothing matches. A stack’s name narrows the search to it.', 'Nessun risultato. Il nome di uno stack limita la ricerca a quello.')}</li>
        )}
      </ul>
      {error
        ? <p className="palette__preview error-text" role="alert">{error}</p>
        : current && (current.type === 'note'
          ? <p className="palette__preview">{text('Opens on Beynt', 'Si apre su Beynt')}{current.path && ` · ${current.path}`}</p>
          : <pre className="palette__preview"><MarkedText text={current.text} /></pre>)}
      {picked !== null && current && (
        <div className="palette__actions menu__list" role="menu" aria-label={text('Actions', 'Azioni')}>
          {actions.map((action, position) => (
            <button key={action} role="menuitem" className={`menu__item ${position === picked ? 'is-selected' : ''}`}
              onMouseMove={() => setPicked(position)} onMouseDown={(e) => e.preventDefault()} onClick={() => run(action, current)}>
              <span>{actionLabel(action, isFavorite(current))}</span>
              <span className="menu__hint">{actionKeys(action, position)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="palette__foot">
        {current && actions.slice(0, 2).map((action, position) => (
          <span key={action}><kbd>{actionKeys(action, position)}</kbd>{actionLabel(action, isFavorite(current))}</span>
        ))}
        <span><kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>{text('Actions', 'Azioni')}</span>
      </div>
    </div>
  )
}
