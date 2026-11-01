import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LanguagePreference } from '../i18n/language'

/** 'auto' follows the system. */
export type AppTheme = 'auto' | 'dark' | 'light'

interface SettingsState {
  language: LanguagePreference
  setLanguage: (language: LanguagePreference) => void
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'auto',
      setLanguage: (language) => set({ language }),
      theme: 'auto',
      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'beynt-settings',
      // Stored by this device's browser storage: anything unexpected falls back to the defaults.
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<SettingsState>
        return {
          ...current,
          ...(state.language === 'en' || state.language === 'it' ? { language: state.language } : {}),
          ...(state.theme === 'dark' || state.theme === 'light' ? { theme: state.theme } : {})
        }
      }
    }
  )
)
