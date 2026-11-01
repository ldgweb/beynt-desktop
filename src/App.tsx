import { useEffect } from 'react'
import type { AppAction } from './types'
import { beynt } from './api'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Toaster } from './components/Toaster/Toaster'
import { LibraryPanel } from './components/Library/LibraryPanel'
import { Palette } from './components/Library/Palette'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { useAccountStore } from './store/account'
import { connectLibrary } from './store/library'
import { useSettingsStore } from './store/settings'
import { useWorkspaceStore } from './store/workspace'
import { useAppTheme } from './hooks/useAppTheme'
import { useI18n } from './i18n'
import { runAction } from './actions'
import { hasModifier, platform } from './platform'
import './styles/app.css'

const isPalette = window.location.hash.startsWith('#palette')
// The palette window on Windows 11 sits on Acrylic: the page must let it through.
if (window.location.hash === '#palette-material') document.documentElement.dataset.material = ''
// The title bar makes room for the window controls of each OS.
document.documentElement.dataset.platform = platform

const SHORTCUTS: Record<string, AppAction> = { '1': 'library', ',': 'settings', f: 'find' }

function MainWindow() {
  const surface = useWorkspaceStore((s) => s.surface)

  useEffect(() => {
    void useAccountStore.getState().refresh()
    return connectLibrary()
  }, [])

  // Desktop shortcuts (⌘ on a Mac, Ctrl elsewhere): 1 shows the library, comma opens Settings, F searches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const action = hasModifier(e) && !e.altKey && !e.shiftKey ? SHORTCUTS[e.key.toLowerCase()] : undefined
      if (!action) return
      e.preventDefault()
      runAction(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The same actions come from the Mac's menu bar.
  useEffect(() => beynt.app.onMenu(runAction), [])

  return (
    <div className="app">
      <TitleBar />
      <div className="workspace">
        <Sidebar />
        {surface === 'library' ? <LibraryPanel /> : <SettingsPanel />}
      </div>
      <Toaster />
    </div>
  )
}

export default function App() {
  const { language } = useI18n()
  useAppTheme()

  // Both windows read the same settings: a change made in one reaches the other.
  useEffect(() => {
    const sync = (e: StorageEvent): void => { if (e.key === 'beynt-settings') void useSettingsStore.persist.rehydrate() }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    void beynt.app.setLanguage(language)
  }, [language])

  return isPalette ? <Palette /> : <MainWindow />
}
