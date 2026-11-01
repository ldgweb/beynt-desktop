export type AppLanguage = 'en' | 'it'
/** 'auto' follows the system languages. */
export type LanguagePreference = 'auto' | AppLanguage

/** The first system language the app speaks, English otherwise. */
export function resolveLanguage(preference: LanguagePreference, languages: readonly string[]): AppLanguage {
  if (preference !== 'auto') return preference
  for (const language of languages) {
    const normalized = language.toLowerCase()
    if (normalized.startsWith('it')) return 'it'
    if (normalized.startsWith('en')) return 'en'
  }
  return 'en'
}
