import { describe, expect, it } from 'vitest'
import { resolveLanguage } from './language'

describe('resolveLanguage', () => {
  it('uses the first supported system language and falls back to English', () => {
    expect(resolveLanguage('auto', ['it-IT', 'en-US'])).toBe('it')
    expect(resolveLanguage('auto', ['en-US', 'it-IT'])).toBe('en')
    expect(resolveLanguage('auto', ['fr-FR'])).toBe('en')
    expect(resolveLanguage('auto', [])).toBe('en')
  })
  it('honors a manual preference', () => {
    expect(resolveLanguage('it', ['en-US'])).toBe('it')
    expect(resolveLanguage('en', ['it-IT'])).toBe('en')
  })
})
