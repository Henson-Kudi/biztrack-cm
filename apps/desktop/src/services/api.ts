'use client'

import { createHttpClient, type RequestConfig } from '@biztrack/http-client/browser'
import type { TokensResponse } from '@biztrack/types'
import { useAuthStore } from '@/stores/auth.store'
import { type ApiEnvelope, unwrapApiResponse } from './api-response'
import { secureStore } from './secure-store'

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'
const TOKENS_KEY = 'auth.tokens'

export const api = createHttpClient({
  baseURL,
  timeout: 15_000,
  withCredentials: true,
})

async function getStoredTokens() {
  const raw = await secureStore.get(TOKENS_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as { accessToken?: string; refreshToken?: string }
  } catch {
    return null
  }
}

api.interceptors.request.use(async (config) => {
  if ((config.headers as any)?.['x-skip-auth']) {
    return config
  }
  const stored = await getStoredTokens()
  const token = stored?.accessToken ?? useAuthStore.getState().accessToken
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let pendingQueue: Array<(token: string | null) => void> = []

function resolveQueue(token: string | null) {
  pendingQueue.forEach((cb) => cb(token))
  pendingQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: any) => {
    const original = error.config
    if (!original || (original.headers as any)?.['x-skip-auth-refresh']) {
      return Promise.reject(error)
    }

    const stored = await getStoredTokens()
    const refreshToken = stored?.refreshToken ?? useAuthStore.getState().refreshToken
    const url = original.url ?? ''
    const isAuthRequest = url.includes('/auth/') || url.includes('/invites/')
    if (error.response?.status === 401 && !isAuthRequest) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push((token) => {
            if (!token) return reject(error)
            original.headers = original.headers ?? {}
            original.headers.Authorization = `Bearer ${token}`
            resolve(api.request(original as RequestConfig))
          })
        })
      }

      isRefreshing = true
      try {
        const refreshPayload = refreshToken ? { refreshToken } : {}
        const { data } = await api.post<ApiEnvelope<TokensResponse>>(
          '/auth/refresh',
          refreshPayload,
          { headers: { 'x-skip-auth-refresh': '1' } },
        )
        const tokens = unwrapApiResponse<TokensResponse>(data).tokens
        if (tokens) {
          await useAuthStore.getState().setTokens(tokens)
          resolveQueue(tokens.accessToken)
          original.headers = original.headers ?? {}
          original.headers.Authorization = `Bearer ${tokens.accessToken}`
          return api.request(original as RequestConfig)
        }
      } catch (refreshError) {
        resolveQueue(null)
        await useAuthStore.getState().clearSession()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
