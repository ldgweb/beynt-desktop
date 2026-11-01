import type { BeyntItem } from '../types'

/**
 * `{{name}}` placeholders as Beynt writes them. Not `${{ … }}` (GitHub Actions) and not
 * `{{ .Values }}` (Go/Helm templates): those belong to the command itself.
 */
export const PLACEHOLDER = /(?<!\$)\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/g

/** Placeholder names in order of first appearance, each once. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))]
}

/** Fills the placeholders that have a value; the others stay as written. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (values[name] ? values[name] : whole))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const HALF_LIFE_MS = 14 * 86_400_000
const FAVORITE = 1e6

/**
 * How high an item goes when titles match equally: favorites first, then frecency (the uses,
 * halved in weight every two weeks since the last one), then nothing.
 */
export function ranker(lastUsed: Record<number, number>, uses: Record<number, number>, favorites: readonly number[], now = Date.now()): (item: BeyntItem) => number {
  const pinned = new Set(favorites)
  return (item) => {
    const last = lastUsed[item.id]
    const recent = last ? Math.max(uses[item.id] ?? 1, 1) * 0.5 ** (Math.max(0, now - last) / HALF_LIFE_MS) : 0
    return (pinned.has(item.id) ? FAVORITE : 0) + recent
  }
}

/**
 * Every word must appear somewhere (title, text, tags, stack, path; notes have no text here). A word
 * that starts a word of the title counts twice, one inside it once; then the rank, then the title.
 */
export function search<T extends BeyntItem>(items: T[], query: string, rank: (item: T) => number = () => 0): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const scored: { item: T; score: number; rank: number }[] = []
  for (const item of items) {
    const title = fold(item.title)
    const text = item.type === 'note' ? '' : item.text
    const haystack = `${title}\n${fold(text)}\n${fold(item.tags.join(' '))}\n${fold(item.stackName)}\n${fold(item.path ?? '')}`
    if (!words.every((word) => haystack.includes(word))) continue
    const starts = title.split(/[^\p{L}\p{N}]+/u)
    const score = words.reduce((sum, word) => sum + (starts.some((start) => start.startsWith(word)) ? 2 : title.includes(word) ? 1 : 0), 0)
    scored.push({ item, score, rank: rank(item) })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.rank - a.rank || a.item.title.localeCompare(b.item.title))
    .map((entry) => entry.item)
}

/** A titled part of a list; `label` null is a part without a heading. */
export interface Group<T> {
  label: string | null
  items: T[]
}

/** Before typing: the favorites, the `recent` most used lately, then the rest by title. */
export function home<T extends BeyntItem>(items: T[], favorites: readonly number[], rank: (item: T) => number, recent = 8): [T[], T[], T[]] {
  const pinned = new Set(favorites)
  const byTitle = (a: T, b: T): number => a.title.localeCompare(b.title)
  const used = items.filter((item) => !pinned.has(item.id) && rank(item) > 0).sort((a, b) => rank(b) - rank(a) || byTitle(a, b)).slice(0, recent)
  const shown = new Set(used.map((item) => item.id))
  return [
    items.filter((item) => pinned.has(item.id)).sort(byTitle),
    used,
    items.filter((item) => !pinned.has(item.id) && !shown.has(item.id)).sort(byTitle)
  ]
}

/** A stack as its folders: what has no folder first, then each folder in path order, items by title. */
export function byFolder<T extends BeyntItem>(items: T[]): Group<T>[] {
  const folders = new Map<string, T[]>()
  for (const item of items) {
    const folder = item.path?.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : ''
    folders.set(folder, [...(folders.get(folder) ?? []), item])
  }
  return [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, entries]) => ({ label: folder || null, items: entries.sort((a, b) => a.title.localeCompare(b.title)) }))
}

/** At most `max` items in all, in order; empty groups are left out. */
export function cap<T>(groups: Group<T>[], max: number): Group<T>[] {
  let left = max
  return groups
    .map((group) => {
      const items = group.items.slice(0, Math.max(0, left))
      left -= items.length
      return { ...group, items }
    })
    .filter((group) => group.items.length > 0)
}

/** What can be done with an item. The first runs on Enter, the second on ⌘/Ctrl+Enter. */
export type ItemAction = 'open' | 'fill' | 'copy' | 'copyRaw' | 'copyTitle' | 'copyLink' | 'favorite'

export function actionsFor(item: BeyntItem): ItemAction[] {
  if (item.type === 'note') return ['open', 'copyTitle', 'copyLink', 'favorite']
  return placeholders(item.text).length > 0
    ? ['fill', 'copyRaw', 'copyTitle', 'open', 'copyLink', 'favorite']
    : ['copy', 'copyTitle', 'open', 'copyLink', 'favorite']
}

/**
 * The action a key runs, if the item has it: Enter, ⌘/Ctrl+Enter, ⌘/Ctrl+O opens on Beynt,
 * ⌘/Ctrl+L copies the link, ⌘/Ctrl+Shift+F adds to or removes from the favorites.
 * `mod` is the platform's own modifier (⌘ on a Mac, Ctrl elsewhere).
 */
export function actionForKey(e: { key: string; mod: boolean; shiftKey: boolean; altKey: boolean }, actions: ItemAction[]): ItemAction | undefined {
  if (e.altKey) return undefined
  const key = e.key.toLowerCase()
  let action: ItemAction | undefined
  if (key === 'enter' && !e.shiftKey) action = actions[e.mod ? 1 : 0]
  else if (e.mod && !e.shiftKey && key === 'o') action = 'open'
  else if (e.mod && !e.shiftKey && key === 'l') action = 'copyLink'
  else if (e.mod && e.shiftKey && key === 'f') action = 'favorite'
  return action && actions.includes(action) ? action : undefined
}

const MAC_SYMBOLS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', CommandOrControl: '⌘' }

/**
 * An accelerator as people read it: `Ctrl + Alt + B` on Windows and Linux; on a Mac the
 * symbols in the system's order (⌃⌥⇧⌘) and then the key, like `⌥⇧Space`.
 */
export function keyLabel(accelerator: string, { mac = false, space = 'Space' }: { mac?: boolean; space?: string } = {}): string {
  const modifiers = accelerator.split('+')
  const last = modifiers.pop() ?? ''
  const key = last === 'Space' ? space : last
  if (mac) return Object.keys(MAC_SYMBOLS).filter((m) => modifiers.includes(m)).map((m) => MAC_SYMBOLS[m]).join('') + key
  return [...modifiers.map((m) => (m === 'CommandOrControl' || m === 'Control' ? 'Ctrl' : m)), key].join(' + ')
}

/**
 * The accelerator for a pressed combination, by physical key (any layout); null while only modifiers
 * are down, without ⌘/Ctrl, the Mac's ⌃ or Alt, or with the Windows key. ⌘ on a Mac and Ctrl elsewhere
 * are CommandOrControl. The Rust side accepts the same set (`palette::is_shortcut`).
 */
export function acceleratorFor(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac = false): string | null {
  const key = /^(?:Key|Digit)([A-Z0-9])$/.exec(e.code)?.[1] ?? (/^(Space|F([1-9]|1\d|2[0-4]))$/.test(e.code) ? e.code : null)
  const command = mac ? e.metaKey : e.ctrlKey
  const control = mac && e.ctrlKey
  if (!key || (!mac && e.metaKey) || !(command || control || e.altKey)) return null
  return [command && 'CommandOrControl', control && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+')
}
