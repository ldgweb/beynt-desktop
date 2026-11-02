import { describe, expect, it } from 'vitest'
import { acceleratorFor, actionForKey, actionsFor, byFolder, cap, fill, home, keyLabel, oneEditApart, placeholders, ranker, search } from './commands'
import type { BeyntCommand, BeyntItem, BeyntNote } from '../types'

const command = (id: number, title: string, text: string, patch: Partial<BeyntCommand> = {}): BeyntCommand => ({
  id, title, text, stackId: 1, stackName: 'My toolbox', type: 'cli', path: null, version: 1, tags: [], verified: false, updatedAt: null, ...patch
})
const note = (id: number, title: string, path: string | null = null): BeyntNote => ({
  id, title, path, stackId: 2, stackName: 'Acme hosting', type: 'note', version: 1, tags: [], verified: false, updatedAt: null
})
const by = (scores: Record<number, number>) => (item: BeyntItem): number => scores[item.id] ?? 0

describe('placeholders', () => {
  it('finds Beynt placeholders once, in order', () => {
    expect(placeholders('ssh {{utente}}@{{ server }} "ls {{path}}" # {{utente}}')).toEqual(['utente', 'server', 'path'])
  })

  it('leaves GitHub Actions and Helm templates alone', () => {
    expect(placeholders('echo ${{ secrets.TOKEN }} {{ .Values.image }} {{host}}')).toEqual(['host'])
  })

  it('fills only the values given', () => {
    expect(fill('ssh {{utente}}@{{ server }}', { utente: 'deploy', server: '' })).toBe('ssh deploy@{{ server }}')
    expect(fill('${{ secrets.X }} {{a}}', { a: '1' })).toBe('${{ secrets.X }} 1')
  })
})

describe('search', () => {
  const list = [
    command(1, 'Riavvia PHP-FPM', 'sudo systemctl restart php8.4-fpm', { tags: ['php'] }),
    command(2, 'Aggiornamento server Ubuntu', 'sudo apt update && sudo apt upgrade -y'),
    command(3, 'Backup database', 'mysqldump {{db}} > backup.sql', { stackName: 'Acme hosting', type: 'query' })
  ]

  it('needs every word, anywhere, ignoring case and accents', () => {
    expect(search(list, 'sudo restart').map((c) => c.id)).toEqual([1])
    expect(search(list, 'AGGIORN').map((c) => c.id)).toEqual([2])
    expect(search(list, 'acme').map((c) => c.id)).toEqual([3])
    expect(search(list, 'nginx')).toEqual([])
  })

  it('ranks title matches before text matches, then by rank', () => {
    const more = [...list, command(4, 'Pulizia log', 'sudo journalctl --vacuum-time=30d')]
    expect(search(more, 'sudo').map((c) => c.id)).toEqual([2, 4, 1])
    expect(search(more, 'sudo', by({ 4: 10 })).map((c) => c.id)).toEqual([4, 2, 1])
    expect(search(more, 'riavvia sudo').map((c) => c.id)).toEqual([1])
  })

  it('puts a word that starts a title word before one inside it', () => {
    const titles = [command(5, 'Log rotation', 'x'), command(6, 'Catalog sync', 'x')]
    expect(search(titles, 'log').map((c) => c.id)).toEqual([5, 6])
    expect(search(titles, 'log', by({ 6: 99 })).map((c) => c.id)).toEqual([5, 6])
  })

  it('finds notes by title, path and stack, never by their text', () => {
    const runbook = note(9, 'Deploy runbook', 'ops/deploy.md')
    expect(search([...list, runbook], 'ops deploy').map((c) => c.id)).toEqual([9])
    expect(search([...list, runbook], 'acme').map((c) => c.id)).toEqual([3, 9])
  })

  it('orders by rank, then title, with an empty query', () => {
    expect(search(list, '  ', by({ 3: 5, 2: 1 })).map((c) => c.id)).toEqual([3, 2, 1])
  })

  it('forgives one typo in a word that nothing contains', () => {
    expect(search(list, 'raivvia').map((c) => c.id)).toEqual([1]) // two letters swapped
    expect(search(list, 'aggiornameto ubuntu').map((c) => c.id)).toEqual([2]) // a letter missing
    expect(search(list, 'bakcu').map((c) => c.id)).toEqual([3]) // still typing, with a swap
    expect(search(list, 'acmr').map((c) => c.id)).toEqual([3]) // in the stack's name
    expect(search(list, 'riavvai php').map((c) => c.id)).toEqual([1])
    expect(search(list, 'riavvai nginx')).toEqual([])
  })

  it('keeps the items with a tag that starts with each #tag', () => {
    const tagged = [...list, command(4, 'PHP info', 'php -i', { tags: ['PHP', 'debug'] })]
    expect(search(tagged, '#php').map((c) => c.id)).toEqual([4, 1])
    expect(search(tagged, '#ph #deb').map((c) => c.id)).toEqual([4])
    expect(search(tagged, 'riavvia #php').map((c) => c.id)).toEqual([1])
    expect(search(tagged, '#nginx')).toEqual([])
    expect(search(tagged, '#').map((c) => c.id)).toHaveLength(4)
  })

  it('takes no word for a typo when an item contains it, nor a short one', () => {
    const more = [...list, command(4, 'Riavvio', 'reboot')]
    expect(search(more, 'riavvia').map((c) => c.id)).toEqual([1])
    expect(search(list, 'pjp')).toEqual([])
  })
})

describe('oneEditApart', () => {
  it('allows one letter added, dropped, changed, or two neighbours swapped', () => {
    for (const [a, b] of [['nginx', 'nginx'], ['ngnx', 'nginx'], ['nginxx', 'nginx'], ['ngimx', 'nginx'], ['nignx', 'nginx'], ['ngixn', 'nginx']]) {
      expect(oneEditApart(a, b), `${a} ${b}`).toBe(true)
    }
    for (const [a, b] of [['ngx', 'nginx'], ['ignnx', 'nginx'], ['nxgin', 'nginx'], ['apache', 'nginx']]) {
      expect(oneEditApart(a, b), `${a} ${b}`).toBe(false)
    }
  })
})

describe('rank', () => {
  const day = 86_400_000
  const now = 100 * day
  it('weighs uses by how recent the last one was, favorites above everything', () => {
    const rank = ranker({ 1: now, 2: now - 28 * day, 3: now - day }, { 1: 1, 2: 8 }, [4], now)
    expect(rank(command(1, 'a', ''))).toBe(1)
    expect(rank(command(2, 'b', ''))).toBe(2) // 8 uses, two half-lives ago
    expect(rank(command(3, 'c', ''))).toBeCloseTo(0.95, 2) // used before uses were counted
    expect(rank(command(4, 'd', ''))).toBeGreaterThan(1000)
    expect(rank(command(5, 'e', ''))).toBe(0)
  })
})

describe('lists', () => {
  it('starts from the favorites, then the most used, then the rest by title', () => {
    const items = [command(1, 'Zeta', ''), command(2, 'Alfa', ''), command(3, 'Beta', ''), command(4, 'Gamma', '')]
    const [pinned, recent, rest] = home(items, [4], by({ 4: 1e6, 1: 3, 3: 1 }))
    expect([pinned, recent, rest].map((part) => part.map((c) => c.id))).toEqual([[4], [1, 3], [2]])
    expect(home(items, [], by({ 1: 3, 3: 1 }), 1)[2].map((c) => c.id)).toEqual([2, 3, 4])
  })

  it('groups a stack by folder, what has no folder first', () => {
    const groups = byFolder([note(1, 'Deploy', 'ops/deploy.md'), note(2, 'Readme', 'README.md'), note(3, 'Backup', 'ops/backup.md'), command(4, 'Loose', 'x'), note(5, 'Incident', 'ops/incidents/a.md')])
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([[null, [4, 2]], ['ops', [3, 1]], ['ops/incidents', [5]]])
  })

  it('caps the items in all and drops empty groups', () => {
    expect(cap([{ label: 'a', items: [1, 2] }, { label: 'b', items: [] }, { label: 'c', items: [3, 4] }], 3)).toEqual([{ label: 'a', items: [1, 2] }, { label: 'c', items: [3] }])
  })
})

describe('actions', () => {
  const press = (key: string, mods: { mod?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) => ({ key, mod: false, shiftKey: false, altKey: false, ...mods })
  const plain = command(1, 'Restart', 'sudo systemctl restart nginx')
  const template = command(2, 'Connect', 'ssh {{user}}@{{host}}')
  const runbook = note(3, 'Runbook')

  it('opens a note on Enter and copies its title on ⌘/Ctrl+Enter', () => {
    expect(actionForKey(press('Enter'), actionsFor(runbook))).toBe('open')
    expect(actionForKey(press('Enter', { mod: true }), actionsFor(runbook))).toBe('copyTitle')
  })

  it('fills a command with placeholders, or copies it as written', () => {
    expect(actionsFor(template).slice(0, 2)).toEqual(['fill', 'copyRaw'])
    expect(actionsFor(plain).slice(0, 2)).toEqual(['copy', 'copyTitle'])
  })

  it('has the same keys for the rest on every item', () => {
    for (const item of [plain, template, runbook]) {
      expect(actionForKey(press('l', { mod: true }), actionsFor(item))).toBe('copyLink')
      expect(actionForKey(press('O', { mod: true }), actionsFor(item))).toBe('open')
      expect(actionForKey(press('F', { mod: true, shiftKey: true }), actionsFor(item))).toBe('favorite')
    }
    expect(actionForKey(press('l'), actionsFor(plain))).toBeUndefined()
    expect(actionForKey(press('Enter', { altKey: true }), actionsFor(plain))).toBeUndefined()
    expect(actionForKey(press('Enter', { shiftKey: true }), actionsFor(plain))).toBeUndefined()
  })
})

describe('shortcut keys', () => {
  type Mods = { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }
  const press = (code: string, mods: Mods = {}, mac = false) =>
    acceleratorFor({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }, mac)
  it('turns a combination into an accelerator by physical key', () => {
    expect(press('KeyB', { ctrlKey: true, altKey: true })).toBe('CommandOrControl+Alt+B')
    expect(press('Digit3', { altKey: true, shiftKey: true })).toBe('Alt+Shift+3')
    expect(press('Space', { ctrlKey: true })).toBe('CommandOrControl+Space')
    expect(press('F12', { ctrlKey: true })).toBe('CommandOrControl+F12')
  })
  it('waits for a real key and needs Ctrl or Alt, never the Windows key', () => {
    expect(press('ControlLeft', { ctrlKey: true })).toBeNull()
    expect(press('KeyB', { shiftKey: true })).toBeNull()
    expect(press('Comma', { ctrlKey: true })).toBeNull()
    expect(press('KeyB', { ctrlKey: true, metaKey: true })).toBeNull()
  })
  it('on a Mac ⌘ is CommandOrControl and ⌃ is Control', () => {
    expect(press('KeyK', { metaKey: true, shiftKey: true }, true)).toBe('CommandOrControl+Shift+K')
    expect(press('Space', { altKey: true, shiftKey: true }, true)).toBe('Alt+Shift+Space')
    expect(press('KeyB', { ctrlKey: true, altKey: true }, true)).toBe('Control+Alt+B')
    expect(press('KeyB', { shiftKey: true }, true)).toBeNull()
  })
  it('reads like the keys on the keyboard', () => {
    expect(keyLabel('CommandOrControl+Alt+Space', { space: 'Spazio' })).toBe('Ctrl + Alt + Spazio')
    expect(keyLabel('Control+Alt+B')).toBe('Ctrl + Alt + B')
    expect(keyLabel('Alt+Shift+Space', { mac: true })).toBe('⌥⇧Space')
    expect(keyLabel('CommandOrControl+Control+Shift+K', { mac: true })).toBe('⌃⇧⌘K')
  })
})
