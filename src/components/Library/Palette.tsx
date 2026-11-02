import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { BeyntCommand, BeyntItem } from '../../types'
import { beynt, errorText } from '../../api'
import { actionForKey, actionsFor, type ItemAction } from '../../core/commands'
import { connectLibrary, copyCommand, runItemAction, useLibraryStore } from '../../store/library'
import { TYPE_FILTERS, useResults, type TypeFilter } from '../../hooks/useResults'
import { useI18n } from '../../i18n'
import { hasModifier, isMac } from '../../platform'
import { IconCheck, IconSearch } from '../Sidebar/icons'
import { actionKeys, FillFields, GroupLabel, ItemRow, MarkedText, TypeFilterBar, useActionLabel } from './parts'

const STALE_MS = 5 * 60_000
const SHOWN = 50

/** The type after `type` in the filter, or before it with `step` -1, going round. */
function nextType(type: TypeFilter, step: 1 | -1): TypeFilter {
  const count = TYPE_FILTERS.length
  return TYPE_FILTERS[(TYPE_FILTERS.indexOf(type) + step + count) % count]
}

/**
 * The global-shortcut window: type, arrows, Enter. Enter runs an item's main action (a command is
 * on the clipboard, a note opens on the web), ⌘/Ctrl+Enter the second one, ⌘/Ctrl+K lists them all.
 * Tab and Shift+Tab narrow the list to a type.
 */
export function Palette() {
  const { text } = useI18n()
  const actionLabel = useActionLabel()
  const library = useLibraryStore((s) => s.library)
  const favorites = useLibraryStore((s) => s.favorites)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [selected, setSelected] = useState(0)
  const [filling, setFilling] = useState<BeyntCommand | null>(null)
  // The open list of actions, and the one picked in it.
  const [picked, setPicked] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const { groups, items: results } = useResults(query, type, 'all', SHOWN)
  const current = results[selected] as BeyntItem | undefined
  const actions = current ? actionsFor(current) : []
  const isFavorite = (item: BeyntItem): boolean => favorites.includes(item.id)

  useEffect(connectLibrary, [])
  useEffect(() => beynt.palette.onOpened(() => {
    setQuery(''); setType('all'); setSelected(0); setFilling(null); setPicked(null); setCopied(false); setError(null)
    input.current?.focus()
    const { library: saved, refreshing } = useLibraryStore.getState()
    if (!refreshing && (!saved.syncedAt || Date.now() - saved.syncedAt > STALE_MS)) void useLibraryStore.getState().refresh()
  }), [])
  useEffect(() => { setSelected(0); setPicked(null); setError(null) }, [query, type])
  useEffect(() => { list.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' }) }, [selected])

  const fail = (failure: unknown): void => setError(errorText(failure))
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
        <div className="palette__foot">
          <span><kbd>↵</kbd>{text('Copy', 'Copia')}</span>
          <span><kbd>Esc</kbd>{text('Back', 'Indietro')}</span>
          <span className="palette__foot-end">{filling.stackName}</span>
        </div>
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
    else if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); setType((now) => nextType(now, e.shiftKey ? -1 : 1)) }
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
      <header className="palette__head">
        <label className="palette__search">
          <IconSearch size={18} />
          <input ref={input} className="palette__input" value={query} autoFocus spellCheck={false}
            placeholder={text('Search commands and notes', 'Cerca comandi e note')}
            aria-label={text('Search commands and notes', 'Cerca comandi e note')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {/* The typing stays in the search field. */}
        <div className="palette__types" onMouseDown={(e) => e.preventDefault()}>
          <TypeFilterBar value={type} onChange={setType} />
        </div>
      </header>
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
        <span className="palette__foot-end"><kbd>Tab</kbd>{text('Type', 'Tipo')}</span>
        <span><kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>{text('Actions', 'Azioni')}</span>
      </div>
    </div>
  )
}
