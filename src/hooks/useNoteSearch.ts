import { useEffect, useMemo, useState } from 'react'
import type { NoteHit } from '../types'
import { beynt } from '../api'
import { useLibraryStore } from '../store/library'

const PAUSE_MS = 300

/**
 * The notes Beynt finds by their text, asked after a pause in typing. Nothing for a query under
 * 2 characters, when `enabled` is false, or when Beynt cannot be reached. A hit the library holds
 * keeps the library's details (its tags).
 */
export function useNoteSearch(query: string, stackId?: number, enabled = true): NoteHit[] {
  const [hits, setHits] = useState<NoteHit[]>([])
  const items = useLibraryStore((s) => s.library.items)

  useEffect(() => {
    const words = query.trim()
    if (!enabled || words.length < 2) { setHits([]); return }
    let current = true
    const timer = setTimeout(() => {
      beynt.library.search(words, stackId).then(
        (found) => { if (current) setHits(found) },
        () => { if (current) setHits([]) }
      )
    }, PAUSE_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [query, stackId, enabled])

  return useMemo(() => hits.map((hit) => {
    const known = items.find((item) => item.id === hit.id)
    return known?.type === 'note' ? { ...known, snippet: hit.snippet } : hit
  }), [hits, items])
}
