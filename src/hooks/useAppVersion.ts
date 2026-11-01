import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'

export function useAppVersion(): string {
  const [version, setVersion] = useState('')
  useEffect(() => { void getVersion().then(setVersion) }, [])
  return version
}
