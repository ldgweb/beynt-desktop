import { create } from 'zustand'
import type { BeyntAccountStatus } from '../types'
import { beynt } from '../api'

/** Account status, read at start-up and after a connection changes; components read `connected` from here. */
interface AccountState extends BeyntAccountStatus {
  /** False until the first answer: the window shows neither the library nor the connection before it. */
  checked: boolean
  refresh: () => Promise<void>
}

let requestRevision = 0

export const useAccountStore = create<AccountState>((set) => ({
  checked: false,
  connected: false,
  baseUrl: '',
  refresh: async () => {
    const request = ++requestRevision
    try {
      const s = await beynt.account.status()
      if (request === requestRevision) set({ checked: true, connected: s.connected, baseUrl: s.baseUrl })
    } catch {
      // the Rust side answers once it runs
    }
  }
}))
