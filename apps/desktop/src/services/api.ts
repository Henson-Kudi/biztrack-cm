'use client'

import { createHttpClient, type RequestConfig } from '@biztrack/http-client/browser'
import type { TokensResponse } from '@biztrack/types'
import { useAuthStore } from '@/stores/auth.store'
import { API_BASE_URL } from '@/config/api-base-url'
import { type ApiEnvelope, unwrapApiResponse } from './api-response'
import { secureStore } from './secure-store'

const TOKENS_KEY = 'auth.tokens'
type HeaderMap = Record<string, string>
type ApiErrorLike = {
  config?: RequestConfig
  response?: {
    status?: number
  }
}

function getHeaderValue(
  config: Pick<RequestConfig, 'headers'> | undefined,
  name: string,
) {
  const headers = config?.headers as Record<string, unknown> | undefined
  return headers?.[name]
}

function ensureHeaders(config: RequestConfig): HeaderMap {
  const headers = (config.headers ?? {}) as HeaderMap
  config.headers = headers
  return headers
}

export const api = createHttpClient({
  baseURL: API_BASE_URL,
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
  if (getHeaderValue(config, 'x-skip-auth')) {
    return config
  }
  const stored = await getStoredTokens()
  const token = stored?.accessToken ?? useAuthStore.getState().accessToken
  if (token) {
    const headers = ensureHeaders(config)
    headers.Authorization = `Bearer ${token}`
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
  async (error: unknown) => {
    const requestError = error as ApiErrorLike
    const original = requestError.config
    if (!original || getHeaderValue(original, 'x-skip-auth-refresh')) {
      return Promise.reject(error)
    }

    const stored = await getStoredTokens()
    const refreshToken = stored?.refreshToken ?? useAuthStore.getState().refreshToken
    const url = original.url ?? ''
    const isAuthRequest = url.includes('/auth/') || url.includes('/invites/')
    if (requestError.response?.status === 401 && !isAuthRequest) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push((token) => {
            if (!token) return reject(error)
            const headers = ensureHeaders(original)
            headers.Authorization = `Bearer ${token}`
            resolve(api.request(original))
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
          const headers = ensureHeaders(original)
          headers.Authorization = `Bearer ${tokens.accessToken}`
          return api.request(original)
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
