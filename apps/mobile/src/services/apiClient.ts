import { useAuthStore } from '../store/useAuthStore'

// ─── Base URL ─────────────────────────────────────────────────────────────────
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Exact suffix of the refresh endpoint — used to break refresh loops */
const REFRESH_PATH = '/auth/refresh'

// ─── Types ────────────────────────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
  params?: Record<string, string>
  headers?: Record<string, string>
  /** Internal — marks a request that has already been retried after a 401 */
  _retried?: boolean
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(`HTTP ${status}`)
    this.name = 'ApiError'
  }
}

// ─── 401 refresh queue ────────────────────────────────────────────────────────

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error)
    else p.resolve(token!)
  })
  failedQueue = []
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, headers: extraHeaders = {}, _retried = false } = options

  const { accessToken, locale } = useAuthStore.getState()

  // Build query string
  const qs = new URLSearchParams(params)
  if (!accessToken && locale) qs.set('locale', locale)
  const queryString = qs.toString()
  const url = `${BASE_URL}${path}${queryString ? `?${queryString}` : ''}`

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  // 10s Timeout to prevent infinite loading on network failure
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal as RequestInit['signal'], // Type cast for React Native fetch compatibility
    })
  } finally {
    clearTimeout(timeoutId)
  }

  // ─── 401 → refresh → retry ────────────────────────────────────────────────

  if (res.status === 401 && !_retried) {
    // Don't try to refresh if this is the refresh endpoint itself
    if (path.endsWith(REFRESH_PATH)) {
      useAuthStore.getState().logout()
      throw new ApiError(401, await res.json().catch(() => null))
    }

    if (isRefreshing) {
      // Another refresh is already in flight — queue this request
      const newToken = await new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
      return request<T>(path, {
        ...options,
        headers: { ...extraHeaders, Authorization: `Bearer ${newToken}` },
        _retried: true,
      })
    }

    isRefreshing = true
    const { refreshToken, setTokens, logout } = useAuthStore.getState()

    if (!refreshToken) {
      isRefreshing = false
      processQueue(new Error('No refresh token'), null)
      logout()
      throw new ApiError(401, await res.json().catch(() => null))
    }

    try {
      const refreshController = new AbortController()
      const refreshTimeoutId = setTimeout(() => refreshController.abort(), 10000)
      let refreshRes: Response
      try {
        refreshRes = await fetch(`${BASE_URL}${REFRESH_PATH}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: refreshController.signal as RequestInit['signal'],
        })
      } finally {
        clearTimeout(refreshTimeoutId)
      }

      if (!refreshRes.ok) {
        throw new ApiError(refreshRes.status, await refreshRes.json().catch(() => null))
      }

      const { accessToken: newAccess, refreshToken: newRefresh } = await refreshRes.json()
      setTokens(newAccess, newRefresh)
      processQueue(null, newAccess)

      return request<T>(path, {
        ...options,
        headers: { ...extraHeaders, Authorization: `Bearer ${newAccess}` },
        _retried: true,
      })
    } catch (refreshError) {
      processQueue(refreshError, null)
      logout()
      throw refreshError
    } finally {
      isRefreshing = false
    }
  }

  // ─── Parse response ────────────────────────────────────────────────────────

  const data = res.status === 204 ? null : await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(res.status, data)
  }

  // Guard: if the server returned 2xx but we couldn't parse the body, fail loudly
  // instead of returning null and crashing downstream with a confusing TypeError.
  if (data === null && res.status !== 204) {
    if (__DEV__) console.error(`[apiClient] JSON parse failed for ${res.status} response on ${path}`)
    throw new ApiError(res.status, null)
  }

  // Unwrap the NestJS global response interceptor format: { success: true, data: T }
  if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
    return (data as any).data as T
  }

  return data as T
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, params?: Record<string, string>) =>
    request<T>(path, { method: 'GET', params }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
}

export default apiClient
