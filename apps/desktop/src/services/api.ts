'use client'

import {
  createHttpClient,
  type HttpError,
  type RequestConfig,
} from '@biztrack/http-client/browser'
import { useAuthStore } from '@/stores/auth.store'

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'

export const api = createHttpClient({
  baseURL,
  timeout: 15_000,
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  if ((config.headers as any)?.['x-skip-auth']) {
    return config
  }
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

type ApiEnvelope<T> = {
  success: boolean
  data?: T
  message?: string
  requestId?: string
  timestamp?: string
}

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

    const refreshToken = useAuthStore.getState().refreshToken
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
        const { data } = await api.post(
          '/auth/refresh',
          refreshPayload,
          { headers: { 'x-skip-auth-refresh': '1' } },
        )
        const envelope = data as ApiEnvelope<unknown>
        const tokens = (envelope && typeof envelope === 'object' && 'success' in envelope
          ? (envelope as ApiEnvelope<any>).data?.tokens
          : (data as any)?.tokens)
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
