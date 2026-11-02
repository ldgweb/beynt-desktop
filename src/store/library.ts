import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BeyntCommand, BeyntItem, Library } from '../types'
import { beynt, errorText } from '../api'
import { ranker, type ItemAction } from '../core/commands'

interface LibraryState {
  library: Library
  loaded: boolean
  refreshing: boolean
  error: string | null
  /** id → last use, to show what you use first. Local to this device, like the two below. */
  lastUsed: Record<number, number>
  /** id → how many uses. */
  uses: Record<number, number>
  favorites: number[]
  load: () => Promise<void>
  refresh: () => Promise<void>
  markUsed: (item: BeyntItem) => void
  toggleFavorite: (item: BeyntItem) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      library: { items: [], syncedAt: null },
      loaded: false,
      refreshing: false,
      error: null,
      lastUsed: {},
      uses: {},
      favorites: [],
      load: async () => {
        const library = await beynt.library.get()
        set({ library, loaded: true })
      },
      refresh: async () => {
        set({ refreshing: true, error: null })
        try {
          const result = await beynt.library.refresh()
          set({ library: result.library, loaded: true, error: result.error ?? null })
        } catch (error) {
          set({ error: errorText(error) })
        } finally {
          set({ refreshing: false })
        }
      },
      markUsed: (item) => set((state) => ({
        lastUsed: { ...state.lastUsed, [item.id]: Date.now() },
        uses: { ...state.uses, [item.id]: (state.uses[item.id] ?? 0) + 1 }
      })),
      toggleFavorite: (item) => set((state) => ({
        favorites: state.favorites.includes(item.id) ? state.favorites.filter((id) => id !== item.id) : [...state.favorites, item.id]
      }))
    }),
    { name: 'beynt-library', partialize: (state) => ({ lastUsed: state.lastUsed, uses: state.uses, favorites: state.favorites }) }
  )
)

/** Keeps every window on the same copy: the Rust side announces each change. */
export function connectLibrary(): () => void {
  void useLibraryStore.getState().load()
  const stop = beynt.library.onChanged((library) => useLibraryStore.setState({ library, loaded: true }))
  // The palette and the main window share localStorage: pick up each other's uses and favorites.
  const sync = (e: StorageEvent): void => { if (e.key === 'beynt-library') void useLibraryStore.persist.rehydrate() }
  window.addEventListener('storage', sync)
  return () => { stop(); window.removeEventListener('storage', sync) }
}

/** The order of search results and of the start lists: favorites, then frecency. */
export function useRank(): (item: BeyntItem) => number {
  const lastUsed = useLibraryStore((s) => s.lastUsed)
  const uses = useLibraryStore((s) => s.uses)
  const favorites = useLibraryStore((s) => s.favorites)
  return useMemo(() => ranker(lastUsed, uses, favorites), [lastUsed, uses, favorites])
}

/** Copies the final text and remembers the use. */
export async function copyCommand(command: BeyntCommand, text: string): Promise<void> {
  await beynt.copy(text)
  useLibraryStore.getState().markUsed(command)
}

/**
 * Runs an action of an item and remembers the use; showing the fields (`fill`) is the window's.
 * Resolves with what happened, so each window gives its own feedback.
 */
export async function runItemAction(action: Exclude<ItemAction, 'fill'>, item: BeyntItem): Promise<'copied' | 'opened' | 'favorite'> {
  const { markUsed, toggleFavorite } = useLibraryStore.getState()
  switch (action) {
    case 'favorite':
      toggleFavorite(item)
      return 'favorite'
    case 'open':
      await beynt.openBeynt(item)
      markUsed(item)
      return 'opened'
    case 'copyLink':
      await beynt.copyLink(item)
      break
    case 'copyTitle':
      await beynt.copy(item.title)
      break
    case 'copy':
    case 'copyRaw':
      await beynt.copy(item.type === 'note' ? item.title : item.text)
      break
  }
  markUsed(item)
  return 'copied'
}
