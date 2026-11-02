import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  AppAction,
  BeyntAccountStatus,
  BeyntItem,
  Library,
  LibraryRefresh,
  NoteHit,
  PaletteStatus,
  ShortcutChange,
  StartupStatus,
  UpdateInfo
} from './types'
import type { AppLanguage } from './i18n/language'

/** An event from the Rust side; the returned function stops listening. */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  const stop = listen<T>(event, (e) => handler(e.payload))
  return () => { void stop.then((unlisten) => unlisten()) }
}

/** What to show for a failed call: the Rust side rejects with a message in the window's language. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Everything privileged runs in the Rust process: the windows only ask. Errors arrive as messages. */
export const beynt = {
  account: {
    status: () => invoke<BeyntAccountStatus>('account_status'),
    /** Checks the key on Beynt first; a refused key is never saved. */
    connect: (token: string, baseUrl: string) => invoke<void>('account_connect', { token, baseUrl }),
    /** Beynt's page where the key is created, on that address (empty: the saved one). */
    openKeys: (baseUrl: string) => invoke<void>('account_open_keys', { baseUrl }),
    disconnect: () => invoke<void>('account_disconnect')
  },

  library: {
    get: () => invoke<Library>('library_get'),
    refresh: () => invoke<LibraryRefresh>('library_refresh'),
    /** Notes with every word in their text, by Beynt's own search: the words go to Beynt. */
    search: (query: string, stackId?: number) => invoke<NoteHit[]>('library_search', { query, stackId: stackId ?? null }),
    onChanged: (handler: (library: Library) => void) => subscribe('library-changed', handler)
  },

  palette: {
    status: () => invoke<PaletteStatus>('palette_status'),
    setShortcut: (shortcut: string) => invoke<ShortcutChange>('palette_set_shortcut', { shortcut }),
    hide: () => invoke<void>('palette_hide'),
    onOpened: (handler: () => void) => subscribe('palette-opened', handler)
  },

  copy: (text: string) => invoke<void>('copy_text', { text }),
  /** beynt.com's link to the item, as its *Copy link* gives it. */
  copyLink: (item: BeyntItem) => invoke<void>('copy_link', { artifact: { stackId: item.stackId, id: item.id } }),
  /** beynt.com, or an item in its reader, on the address the key was saved with. */
  openBeynt: (item?: BeyntItem) => invoke<void>('open_beynt', { artifact: item ? { stackId: item.stackId, id: item.id } : null }),

  update: {
    /** The newer version found by the last check, or null. */
    status: () => invoke<UpdateInfo | null>('update_status'),
    /** Downloads, checks the signature, installs and restarts: it resolves only on failure. */
    install: () => invoke<void>('update_install'),
    onAvailable: (handler: (update: UpdateInfo) => void) => subscribe('update-available', handler)
  },

  app: {
    quit: () => invoke<void>('quit'),
    /** The language the window shows, for the tray and the Rust side's messages. */
    setLanguage: (language: AppLanguage) => invoke<void>('set_language', { language }),
    getStartup: () => invoke<StartupStatus>('startup_get'),
    setStartup: (enabled: boolean) => invoke<StartupStatus>('startup_set', { enabled }),
    /** Actions picked in the tray or the Mac's menu bar. */
    onMenu: (handler: (action: AppAction) => void) => subscribe('app-menu', handler)
  }
}
