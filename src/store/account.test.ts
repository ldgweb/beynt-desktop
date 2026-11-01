import { expect, it, vi } from 'vitest'
import type { BeyntAccountStatus } from '../types'

const status = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ beynt: { account: { status } } }))

const { useAccountStore } = await import('./account')

it('does not show an older account when status replies arrive out of order', async () => {
  let resolve!: (status: BeyntAccountStatus) => void
  status.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    .mockResolvedValueOnce({ connected: false, baseUrl: 'https://current.test' })
  const older = useAccountStore.getState().refresh()
  await useAccountStore.getState().refresh()
  resolve({ connected: true, baseUrl: 'https://old.test' }); await older
  expect(useAccountStore.getState()).toMatchObject({ connected: false, baseUrl: 'https://current.test' })
})
