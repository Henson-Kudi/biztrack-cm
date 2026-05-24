'use client'

import { useEffect, useState } from 'react'
import type { SyncSettings, SyncSnapshot } from '@biztrack/types'
import { ipc } from '@/services/ipc.bridge'

const fallbackSnapshot: SyncSnapshot = {
  status: 'disabled',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  lastFailureDetails: null,
  network: {
    online: true,
    quality: 'strong',
    latencyMs: null,
    lastCheckedAt: null,
  },
  settings: {
    autoSyncEnabled: false,
    minQuality: 'fair',
  },
  realtime: {
    mode: 'disabled',
    status: 'disconnected',
  },
}

export function useSyncSnapshot() {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(fallbackSnapshot)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    setEnabled(typeof window !== 'undefined' && Boolean(window.electronAPI))
  }, [])

  useEffect(() => {
    if (!enabled) {
      setSnapshot(fallbackSnapshot)
      return
    }

    let mounted = true

    ipc.sync
      .getSnapshot()
      .then((value) => {
        if (mounted) {
          setSnapshot(value)
        }
      })
      .catch(() => {
        if (mounted) {
          setSnapshot(fallbackSnapshot)
        }
      })

    ipc.sync.onSnapshotChange((value) => {
      setSnapshot(value)
    })

    return () => {
      mounted = false
    }
  }, [enabled])

  const trigger = async () => {
    await ipc.sync.trigger()
  }

  const updateSettings = async (settings: Partial<SyncSettings>) => {
    const next = await ipc.sync.updateSettings(settings)
    setSnapshot(next)
  }

  return {
    snapshot,
    trigger,
    updateSettings,
  }
}
