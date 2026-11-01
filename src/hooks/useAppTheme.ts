import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useSettingsStore } from '../store/settings'

const query = '(prefers-color-scheme: dark)'
const isPalette = window.location.hash.startsWith('#palette')

/** Resolves 'auto' against the OS, then sets the page's tokens and the native window around it. */
export function useAppTheme(): void {
  const preference = useSettingsStore((s) => s.theme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const change = (): void => setSystemDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  const theme = preference === 'auto' ? (systemDark ? 'dark' : 'light') : preference
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    const win = getCurrentWindow()
    // null lets the window follow the OS: a forced theme would also pin the page's prefers-color-scheme.
    void win.setTheme(preference === 'auto' ? null : theme)
    // What shows while the window resizes: the title bar's colour, or the palette's. Acrylic stays transparent.
    if ('material' in root.dataset) return
    void win.setBackgroundColor(getComputedStyle(root).getPropertyValue(isPalette ? '--bg' : '--chrome').trim())
  }, [preference, theme])
}
