import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import type { BeyntCommand, BeyntItem, ItemType } from '../../types'
import { fill, PLACEHOLDER, placeholders, type ItemAction } from '../../core/commands'
import { useI18n } from '../../i18n'
import { IconCheck, IconNote, IconStar } from '../Sidebar/icons'
import { hasModifier, isMac } from '../../platform'
import { TYPE_FILTERS, type TypeFilter } from '../../hooks/useResults'

export function useTypeLabel(): (type: ItemType) => string {
  const { text } = useI18n()
  return (type) => ({ cli: text('Command', 'Comando'), query: 'Query', config: 'Config', prompt: 'Prompt', note: text('Note', 'Nota') })[type]
}

/** A type's name for a filter: the items of that type. */
function useTypesLabel(): (type: ItemType) => string {
  const { text } = useI18n()
  return (type) => ({
    cli: text('Commands', 'Comandi'),
    query: text('Queries', 'Query'),
    config: text('Configs', 'Config'),
    prompt: text('Prompts', 'Prompt'),
    note: text('Notes', 'Note')
  })[type]
}

export function useActionLabel(): (action: ItemAction, favorite: boolean) => string {
  const { text } = useI18n()
  return (action, favorite) => ({
    open: text('Open on Beynt', 'Apri su Beynt'),
    fill: text('Fill in', 'Compila'),
    copy: text('Copy', 'Copia'),
    copyRaw: text('Copy as written', 'Copia così com’è'),
    copyTitle: text('Copy title', 'Copia titolo'),
    copyLink: text('Copy link', 'Copia link'),
    favorite: favorite ? text('Remove from favorites', 'Togli dai preferiti') : text('Add to favorites', 'Aggiungi ai preferiti')
  })[action]
}

/** The keys of an action at `index` in the item's list (see `actionForKey`), or null. */
export function actionKeys(action: ItemAction, index: number): string | null {
  const mod = isMac ? '⌘' : 'Ctrl '
  if (index === 0) return '↵'
  if (index === 1) return `${mod}↵`
  if (action === 'open') return `${mod}O`
  if (action === 'copyLink') return `${mod}L`
  if (action === 'favorite') return isMac ? '⌘⇧F' : 'Ctrl Shift F'
  return null
}

/** A heading inside a list of rows; not an option. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <li role="presentation" className="rows__section">{children}</li>
}

/** The type's colour as on beynt.com; a note gets its page icon, since it opens instead of copying. */
export function TypeMark({ type }: { type: ItemType }) {
  const typeLabel = useTypeLabel()
  return type === 'note'
    ? <span className="type-note" title={typeLabel(type)}><IconNote size={13} /></span>
    : <span className={`type-dot type-dot--${type}`} title={typeLabel(type)} />
}

/** All types, or one: the same control in the library and the palette. */
export function TypeFilterBar({ value, onChange }: { value: TypeFilter; onChange: (type: TypeFilter) => void }) {
  const { text } = useI18n()
  const typesLabel = useTypesLabel()
  return (
    <div className="segmented" role="group" aria-label={text('Type', 'Tipo')}>
      {TYPE_FILTERS.map((type) => (
        <button key={type} type="button" aria-pressed={value === type} onClick={() => onChange(type)}>
          {type === 'all' ? text('All', 'Tutti') : <><TypeMark type={type} />{typesLabel(type)}</>}
        </button>
      ))}
    </div>
  )
}

/** The first line of a command; for a note, the line where Beynt found the words, or where it lives. */
function summary(item: BeyntItem): string {
  if (item.type === 'note') return ('snippet' in item && typeof item.snippet === 'string' && item.snippet) || (item.path ?? '')
  return item.text.split('\n').find((line) => line.trim()) ?? ''
}

/** One line per item: type, title, favorite, stack, first line of the text. */
export const ItemRow = forwardRef<HTMLButtonElement, { item: BeyntItem; selected: boolean; showStack: boolean; favorite?: boolean; onSelect: () => void; onChoose: () => void }>(
  function ItemRow({ item, selected, showStack, favorite = false, onSelect, onChoose }, ref) {
    return (
      <button ref={ref} className={`row ${selected ? 'is-selected' : ''}`} role="option" aria-selected={selected} tabIndex={-1}
        onClick={onSelect} onDoubleClick={onChoose} onMouseDown={(e) => e.preventDefault()}>
        <TypeMark type={item.type} />
        <span className="row__title">{item.title}</span>
        <span className="row__meta">
          {favorite && <span className="row__favorite"><IconStar size={12} filled /></span>}
          {item.verified && <span className="verified"><IconCheck size={12} /></span>}
          {showStack && item.stackName}
        </span>
        <span className="row__text">{summary(item)}</span>
      </button>
    )
  }
)

/** The text with its {{placeholders}} marked. */
export function MarkedText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    parts.push(text.slice(last, match.index), <mark key={match.index}>{match[0]}</mark>)
    last = match.index! + match[0].length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

/**
 * One field per placeholder and the live result. Enter copies the filled text.
 * Values are kept per command for this session only, never stored.
 */
export function FillFields({ command, onCopy, autoFocus, footer }: { command: BeyntCommand; onCopy: (text: string) => void; autoFocus?: boolean; footer?: ReactNode }) {
  const { text } = useI18n()
  const names = placeholders(command.text)
  const [values, setValues] = useState<Record<string, string>>({})
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  // Prompts get pasted text (a report, a log): keep its lines, copy with ⌘/Ctrl+Enter.
  const multiline = command.type === 'prompt'
  useEffect(() => { setValues({}); if (autoFocus) first.current?.focus() }, [command.id, autoFocus])
  const result = fill(command.text, values)

  return (
    <form className="fill" onSubmit={(e) => { e.preventDefault(); onCopy(result) }}
      onKeyDown={(e) => { if (multiline && e.key === 'Enter' && hasModifier(e)) { e.preventDefault(); onCopy(result) } }}>
      {names.map((name, index) => (
        <label key={name} className="fill__field">
          <span>{name}</span>
          {multiline
            ? <textarea ref={index === 0 ? first : undefined} className="input input--mono input--area" rows={3} value={values[name] ?? ''} spellCheck={false}
              onChange={(e) => setValues((current) => ({ ...current, [name]: e.target.value }))} />
            : <input ref={index === 0 ? first : undefined} className="input input--mono" value={values[name] ?? ''} spellCheck={false} autoComplete="off"
              onChange={(e) => setValues((current) => ({ ...current, [name]: e.target.value }))} />}
        </label>
      ))}
      <pre className="detail__code" aria-label={text('Result', 'Risultato')}><MarkedText text={result} /></pre>
      <div className="fill__actions">
        {footer}
        {names.length > 0 && <button type="button" className="btn" onClick={() => onCopy(command.text)}>{text('Copy as written', 'Copia così com’è')}</button>}
        <button type="submit" className="btn btn--primary">{text('Copy', 'Copia')} <kbd>{multiline ? (isMac ? '⌘↵' : 'Ctrl ↵') : '↵'}</kbd></button>
      </div>
    </form>
  )
}
