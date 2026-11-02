import { useEffect, useMemo, useState } from 'react'
import type { NoteHit } from '../types'
import { beynt } from '../api'
import { useLibraryStore } from '../store/library'

const PAUSE_MS = 300

/**
 * The notes Beynt finds by their text, asked after a pause in typing. Nothing for a query under
 * 2 characters, when `enabled` is false, when Beynt cannot be reached, or while the answer for the
 * words now typed has not arrived. A hit the library holds keeps the library's details (its tags).
 */
export function useNoteSearch(query: string, stackId?: number, enabled = true): NoteHit[] {
  const words = query.trim()
  // The question the hits answer: hits for other words or another stack are never shown.
  const asked = enabled && words.length >= 2 ? JSON.stringify([words, stackId]) : null
  const [answer, setAnswer] = useState<{ asked: string; hits: NoteHit[] } | null>(null)
  const items = useLibraryStore((s) => s.library.items)

  useEffect(() => {
    if (asked === null) return
    let current = true
    const timer = setTimeout(() => {
      beynt.library.search(words, stackId).then(
        (hits) => { if (current) setAnswer({ asked, hits }) },
        () => { if (current) setAnswer({ asked, hits: [] }) }
      )
    }, PAUSE_MS)
    return () => { current = false; clearTimeout(timer) }
  }, [asked, words, stackId])

  return useMemo(() => {
    if (answer === null || answer.asked !== asked) return []
    return answer.hits.map((hit) => {
      const known = items.find((item) => item.id === hit.id)
      return known?.type === 'note' ? { ...known, snippet: hit.snippet } : hit
    })
  }, [answer, asked, items])
}
