'use client'

import { create } from 'zustand'
import { getPlanState, getQuotaUsage } from '@/services/auth.api'
import { ipc } from '@/services/ipc.bridge'
import {
  type DesktopPlanState,
  applyQuotaUsageRefreshCache,
  loadPlanStateCache,
  materializeDesktopPlanState,
  savePlanStateCache,
} from '@/services/plan-state.local'

type NetworkRefreshArgs = {
  businessId: string | null
  accessToken: string | null
}

type PlanStoreState = {
  hydrated: boolean
  loading: boolean
  refreshing: boolean
  businessId: string | null
  current: DesktopPlanState | null
  lastError: string | null
  hydrateForBusiness: (args: NetworkRefreshArgs) => Promise<void>
  refreshPlanState: (args: NetworkRefreshArgs) => Promise<DesktopPlanState | null>
  refreshQuotaUsage: (args: NetworkRefreshArgs) => Promise<DesktopPlanState | null>
  recalculateLocalUsage: (businessId: string | null) => Promise<DesktopPlanState | null>
  clear: () => void
}

export const usePlanStore = create<PlanStoreState>((set, get) => ({
  hydrated: false,
  loading: false,
  refreshing: false,
  businessId: null,
  current: null,
  lastError: null,
  hydrateForBusiness: async ({ businessId, accessToken }) => {
    if (!businessId) {
      set({
        hydrated: true,
        loading: false,
        refreshing: false,
        businessId: null,
        current: null,
        lastError: null,
      })
      return
    }

    set({ loading: true, businessId, lastError: null })

    try {
      const cached = await loadPlanStateCache(businessId)
      const materialized = await materializeDesktopPlanState(businessId, cached)

      set({
        hydrated: true,
        loading: false,
        businessId,
        current: materialized,
      })
    } catch (error) {
      set({
        hydrated: true,
        loading: false,
        businessId,
        lastError: error instanceof Error ? error.message : 'Unable to load cached plan state.',
      })
    }

    if (await canRefreshFromServer(accessToken)) {
      void get().refreshPlanState({ businessId, accessToken })
    }
  },
  refreshPlanState: async ({ businessId, accessToken }) => {
    if (!businessId || !(await canRefreshFromServer(accessToken))) {
      return get().current
    }

    set({ refreshing: true, lastError: null })

    try {
      const state = await getPlanState()
      await savePlanStateCache(businessId, state)

      const materialized = await materializeDesktopPlanState(businessId, state)

      if (get().businessId === businessId) {
        set({
          hydrated: true,
          loading: false,
          refreshing: false,
          current: materialized,
          lastError: null,
        })
      } else {
        set({ refreshing: false })
      }

      return materialized
    } catch (error) {
      set({
        refreshing: false,
        lastError:
          error instanceof Error ? error.message : 'Unable to refresh business plan state.',
      })
      return get().current
    }
  },
  refreshQuotaUsage: async ({ businessId, accessToken }) => {
    if (!businessId || !(await canRefreshFromServer(accessToken))) {
      return get().current
    }

    set({ refreshing: true, lastError: null })

    try {
      const response = await getQuotaUsage()
      const cached = await applyQuotaUsageRefreshCache(businessId, response)
      if (!cached) {
        return get().refreshPlanState({ businessId, accessToken })
      }

      const materialized = await materializeDesktopPlanState(businessId, cached)

      if (get().businessId === businessId) {
        set({
          hydrated: true,
          loading: false,
          refreshing: false,
          current: materialized,
          lastError: null,
        })
      } else {
        set({ refreshing: false })
      }

      return materialized
    } catch (error) {
      set({
        refreshing: false,
        lastError: error instanceof Error ? error.message : 'Unable to refresh quota usage.',
      })
      return get().current
    }
  },
  recalculateLocalUsage: async (businessId) => {
    if (!businessId) {
      return null
    }

    // We recompute usage from the local SQLite tables because this desktop app
    // is offline-first: pending local writes must immediately affect quota UI
    // even before the server has seen them.
    const cached = await loadPlanStateCache(businessId)
    const materialized = await materializeDesktopPlanState(businessId, cached)

    if (get().businessId === businessId) {
      set({ current: materialized })
    }

    return materialized
  },
  clear: () => {
    set({
      hydrated: true,
      loading: false,
      refreshing: false,
      businessId: null,
      current: null,
      lastError: null,
    })
  },
}))

async function canRefreshFromServer(accessToken: string | null) {
  if (!accessToken) {
    return false
  }

  try {
    return await ipc.network.isOnline()
  } catch {
    return false
  }
}
