import { useMemo } from 'react'
import { COMMAND_TYPES, type BeyntItem, type ItemType } from '../types'
import type { LibraryScope } from '../store/workspace'
import { byFolder, cap, home, parseQuery, search, type Group } from '../core/commands'
import { useLibraryStore, useRank } from '../store/library'
import { useNoteSearch } from './useNoteSearch'
import { useI18n } from '../i18n'

export type TypeFilter = ItemType | 'all'
export const TYPE_FILTERS: TypeFilter[] = ['all', ...COMMAND_TYPES, 'note']

export interface Results {
  groups: Group<BeyntItem>[]
  /** The groups' items in order, as the arrows go through them. */
  items: BeyntItem[]
  /** How many items the scope holds, and how many of them match the words and the type. */
  total: number
  matched: number
}

/**
 * What a list of the library shows. Before typing: the favorites, the recent and the rest, or a
 * stack by its folders. Then the matches, and below them the notes Beynt finds by their text.
 * The library and the palette share it; `limit` caps the items of the library shown.
 */
export function useResults(query: string, type: TypeFilter, scope: LibraryScope, limit: number): Results {
  const { text, language } = useI18n()
  const items = useLibraryStore((s) => s.library.items)
  const favorites = useLibraryStore((s) => s.favorites)
  const rank = useRank()

  const inScope = useMemo(() => items.filter((item) =>
    scope === 'all' || (scope === 'favorites' ? favorites.includes(item.id) : item.stackId === scope)), [items, scope, favorites])
  const ofType = useMemo(() => inScope.filter((item) => type === 'all' || item.type === type), [inScope, type])
  const found = useMemo(() => search(ofType, query, rank), [ofType, query, rank])
  // Notes carry no tags here: a #tag leaves them out, and Beynt's search with them.
  const tagged = parseQuery(query).tags.length > 0
  const hits = useNoteSearch(query, typeof scope === 'number' ? scope : undefined, !tagged && scope !== 'favorites' && (type === 'all' || type === 'note'))

  const groups = useMemo((): Group<BeyntItem>[] => {
    if (query.trim()) {
      const shown = new Set(found.map((item) => item.id))
      return [
        { label: null, items: found.slice(0, limit) },
        { label: text('In the text of notes', 'Nel testo delle note'), items: hits.filter((hit) => !shown.has(hit.id)) }
      ].filter((group) => group.items.length > 0)
    }
    if (typeof scope === 'number') return cap(byFolder(ofType), limit)
    if (scope === 'favorites') return cap([{ label: null, items: found }], limit)
    const [pinned, recent, rest] = home(ofType, favorites, rank)
    return cap([
      { label: text('Favorites', 'Preferiti'), items: pinned },
      { label: text('Recent', 'Recenti'), items: recent },
      { label: pinned.length || recent.length ? text('All', 'Tutti') : null, items: rest }
    ], limit)
  }, [query, found, hits, scope, ofType, favorites, rank, limit, text, language])
  const shown = useMemo(() => groups.flatMap((group) => group.items), [groups])

  return { groups, items: shown, total: inScope.length, matched: found.length }
}
