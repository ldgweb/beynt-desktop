import { beforeEach, describe, expect, it } from 'vitest'
import { translate } from './index'
import { useSettingsStore } from '../store/settings'

describe('i18n', () => {
  beforeEach(() => useSettingsStore.setState({ language: 'auto' }))

  it('translates typed keys and interpolates values', () => {
    useSettingsStore.setState({ language: 'en' })
    expect(translate('nav.settings')).toBe('Settings')
    expect(translate('library.count', { count: 3 })).toBe('3 items')
    useSettingsStore.setState({ language: 'it' })
    expect(translate('nav.settings')).toBe('Impostazioni')
  })
})
