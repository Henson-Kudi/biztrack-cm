'use client'

import { useEffect, useState } from 'react'
import { ipc } from '@/services/ipc.bridge'

export function useNetworkStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let mounted = true
    ipc.network.isOnline().then((value) => {
      if (mounted) setOnline(value)
    })
    ipc.network.onStatusChange((value) => {
      setOnline(value)
    })
    return () => {
      mounted = false
    }
  }, [])

  return online
}
