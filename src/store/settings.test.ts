// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

function saveSettings(state: Record<string, unknown>): void {
  localStorage.setItem('beynt-settings', JSON.stringify({ state, version: 0 }))
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('settings persistence', () => {
  it('restores the saved preferences', async () => {
    saveSettings({ theme: 'light', language: 'it' })
    const { useSettingsStore } = await import('./settings')
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', language: 'it' })
  })

  it('falls back to defaults for unknown values', async () => {
    saveSettings({ theme: 'neon', language: 'fr' })
    const { useSettingsStore } = await import('./settings')
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'auto', language: 'auto' })
  })
})
