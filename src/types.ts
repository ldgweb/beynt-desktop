// The shapes the Rust side (src-tauri) sends and receives.

export interface BeyntAccountStatus {
  connected: boolean
  baseUrl: string
}

/** Beynt artifact types copied rather than read. */
export const COMMAND_TYPES = ['cli', 'query', 'config', 'prompt'] as const
export type CommandType = (typeof COMMAND_TYPES)[number]
export type ItemType = CommandType | 'note'

interface ItemBase {
  id: number
  stackId: number
  stackName: string
  title: string
  path: string | null
  version: number
  tags: string[]
  verified: boolean
  updatedAt: string | null
}

export interface BeyntCommand extends ItemBase {
  type: CommandType
  /** The command, query, config or prompt text, with its {{placeholders}}. */
  text: string
}

/** Only its title and place: a note opens in beynt.com's reader. */
export interface BeyntNote extends ItemBase {
  type: 'note'
}

export type BeyntItem = BeyntCommand | BeyntNote

/** A note Beynt found by its text, with the line where the words are. */
export interface NoteHit extends BeyntNote {
  snippet: string
}

/** The local copy: shown at once and offline, refreshed from Beynt. */
export interface Library {
  items: BeyntItem[]
  syncedAt: number | null
}

export interface LibraryRefresh {
  library: Library
  error?: string
}

/** The palette's global shortcut as an accelerator; registered is false when another app owns it. */
export interface PaletteStatus {
  shortcut: string
  registered: boolean
  /** Linux only: the command to bind to a system shortcut when the desktop refuses ours (Wayland). */
  launchCommand?: string
}

/** taken: the new combination belongs to another app, so the previous one stayed. */
export interface ShortcutChange extends PaletteStatus {
  taken: boolean
}

export interface StartupStatus {
  /** Only installed builds start at login. */
  available: boolean
  enabled: boolean
}

/** A newer version on the project's releases, ready to install. */
export interface UpdateInfo {
  version: string
  notes?: string | null
}

/** What the menus and shortcuts do; on a Mac the same actions come from the menu bar. */
export type AppAction = 'library' | 'settings' | 'find'
