import { resolveLanguage, type AppLanguage } from './language'
import { useSettingsStore } from '../store/settings'

const en = {
  'nav.library': 'Library',
  'nav.settings': 'Settings',
  'menu.file': 'File',
  'menu.view': 'View',
  'menu.help': 'Help',
  'menu.search': 'Search',
  'menu.quit': 'Quit',
  'settings.title': 'Settings',
  'settings.sections': 'Settings sections',
  'settings.appearance': 'Appearance',
  'appearance.language': 'Language',
  'appearance.language.hint': 'Automatic follows your operating system language.',
  'appearance.language.auto': 'Automatic',
  'appearance.language.en': 'English',
  'appearance.language.it': 'Italiano',
  'appearance.theme': 'App theme',
  'library.count': '{count} items'
} as const

type TranslationKey = keyof typeof en

const it: Record<TranslationKey, string> = {
  'nav.library': 'Libreria', 'nav.settings': 'Impostazioni',
  'menu.file': 'File', 'menu.view': 'Visualizza', 'menu.help': 'Aiuto', 'menu.search': 'Cerca', 'menu.quit': 'Esci',
  'settings.title': 'Impostazioni', 'settings.sections': 'Sezioni impostazioni', 'settings.appearance': 'Aspetto',
  'appearance.language': 'Lingua', 'appearance.language.hint': 'Automatico segue la lingua del sistema operativo.',
  'appearance.language.auto': 'Automatico', 'appearance.language.en': 'English', 'appearance.language.it': 'Italiano',
  'appearance.theme': 'Tema app',
  'library.count': '{count} elementi'
}

function current(): AppLanguage {
  return resolveLanguage(useSettingsStore.getState().language, typeof navigator === 'undefined' ? [] : navigator.languages)
}

export function translate(key: TranslationKey, values?: Record<string, string | number>): string {
  let value = (current() === 'it' ? it : en)[key]
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}

export function localized(english: string, italian: string): string {
  return current() === 'it' ? italian : english
}

export function useI18n(): { language: AppLanguage; t: typeof translate; text: typeof localized } {
  useSettingsStore((state) => state.language) // re-render when the choice changes
  return { language: current(), t: translate, text: localized }
}
