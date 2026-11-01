/** The OS, from the webview's user agent: shortcuts, labels and window chrome differ on a Mac. */
const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
export const platform = /Macintosh/.test(agent) ? 'darwin' : /Windows/.test(agent) ? 'win32' : 'linux'
export const isMac = platform === 'darwin'
export const isWindows = platform === 'win32'

/** True when the app's own modifier is down: ⌘ on a Mac, Ctrl elsewhere, and not the other one. */
export function hasModifier(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}
