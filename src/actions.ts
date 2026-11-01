import type { AppAction } from './types'
import { useWorkspaceStore } from './store/workspace'

/** What the menus and shortcuts do, in one place: the title bar, the keyboard and the Mac menu bar share it. */
export function runAction(action: AppAction): void {
  const workspace = useWorkspaceStore.getState()
  switch (action) {
    case 'library':
    case 'settings':
      workspace.setSurface(action)
      break
    case 'find':
      workspace.setSurface('library')
      setTimeout(() => window.dispatchEvent(new Event('beynt:find')))
      break
  }
}
