import { describe, expect, it } from 'vitest'
import { latest } from './latest-json.mjs'

const release = { version: '0.7.0', repository: 'ldgweb/beynt-desktop', tag: 'v0.7.0', date: new Date('2026-11-02T10:00:00Z') }
const download = 'https://github.com/ldgweb/beynt-desktop/releases/download/v0.7.0/'

describe('latest.json', () => {
  it('points each system at its signed file of the release', () => {
    const json = latest({ ...release, signature: (file) => (file.endsWith('.deb') ? null : `signed ${file}`) })
    expect(json.version).toBe('0.7.0')
    expect(json.pub_date).toBe('2026-11-02T10:00:00.000Z')
    expect(json.platforms['windows-x86_64']).toEqual({ signature: 'signed Beynt-0.7.0-win-x64.exe', url: `${download}Beynt-0.7.0-win-x64.exe` })
    expect(json.platforms['darwin-aarch64-app'].url).toBe(`${download}Beynt-0.7.0-mac-universal.app.tar.gz`)
    expect(Object.keys(json.platforms).sort()).toEqual([
      'darwin-aarch64', 'darwin-aarch64-app', 'darwin-x86_64', 'darwin-x86_64-app', 'linux-x86_64-appimage', 'windows-x86_64', 'windows-x86_64-nsis'
    ])
  })

  it('offers the .deb only when it was signed, and never the AppImage to it', () => {
    const json = latest({ ...release, signature: (file) => `signed ${file}` })
    expect(json.platforms['linux-x86_64-deb'].url).toBe(`${download}Beynt-0.7.0-linux-amd64.deb`)
    expect(json.platforms['linux-x86_64']).toBeUndefined()
  })

  it('refuses a release that left a system out', () => {
    expect(() => latest({ ...release, signature: (file) => (file.includes('win') ? 'signed' : null) }))
      .toThrow('No signed update for darwin-aarch64, linux-x86_64-appimage')
  })
})
