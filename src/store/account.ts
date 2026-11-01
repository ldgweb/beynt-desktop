import { create } from 'zustand'
import type { BeyntAccountStatus } from '../types'
import { beynt } from '../api'

/** Account status, read at start-up and after Settings changes it; components read `connected` from here. */
interface AccountState extends BeyntAccountStatus {
  refresh: () => Promise<void>
}

let requestRevision = 0

export const useAccountStore = create<AccountState>((set) => ({
  connected: false,
  baseUrl: '',
  refresh: async () => {
    const request = ++requestRevision
    try {
      const s = await beynt.account.status()
      if (request === requestRevision) set({ connected: s.connected, baseUrl: s.baseUrl })
    } catch {
      // the Rust side answers once it runs
    }
  }
}))
