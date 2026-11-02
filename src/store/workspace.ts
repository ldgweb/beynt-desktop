import { create } from 'zustand'

export type Surface = 'library' | 'settings'
export type SettingsSection = 'account' | 'startup' | 'appearance'
export type LibraryScope = number | 'all' | 'favorites'

interface WorkspaceState {
  surface: Surface
  settingsSection: SettingsSection
  /** What the sidebar narrows the library to: a stack, the favorites, or nothing. */
  stack: LibraryScope
  setSurface: (surface: Surface) => void
  setSettingsSection: (section: SettingsSection) => void
  showLibrary: (stack: LibraryScope) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  surface: 'library',
  settingsSection: 'account',
  stack: 'all',
  setSurface: (surface) => set({ surface }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  showLibrary: (stack) => set({ surface: 'library', stack })
}))
