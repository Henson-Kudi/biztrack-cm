export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"

export type RequestHeaders = Record<string, string>

export type RequestParams = Record<
  string,
  string | number | boolean | null | undefined
>

export type RequestConfig = {
  url: string
  method?: HttpMethod
  baseURL?: string
  headers?: RequestHeaders
  params?: RequestParams
  data?: unknown
  timeout?: number
  withCredentials?: boolean
  signal?: AbortSignal
}

export type RequestDefaults = Omit<RequestConfig, "url">

export type RequestOptions = Omit<RequestConfig, "url" | "method" | "data">

export type HttpResponse<T = unknown> = {
  status: number
  statusText: string
  data: T
  headers: Headers
  config: RequestConfig
  url: string
}

export class HttpError<T = unknown> extends Error {
  public readonly config: RequestConfig
  public readonly response?: HttpResponse<T>
  public readonly status?: number

  constructor(message: string, config: RequestConfig, response?: HttpResponse<T>) {
    super(message)
    this.name = "HttpError"
    this.config = config
    this.response = response
    this.status = response?.status
  }
}

type Fulfilled<T> = (value: T) => T | Promise<T>
type Rejected = (error: unknown) => unknown | Promise<unknown>

type InterceptorHandler<T> = {
  fulfilled: Fulfilled<T>
  rejected?: Rejected
}

class InterceptorManager<T> {
  private handlers: Array<InterceptorHandler<T> | null> = []

  use(fulfilled: Fulfilled<T>, rejected?: Rejected) {
    this.handlers.push({ fulfilled, rejected })
    return this.handlers.length - 1
  }

  eject(id: number) {
    if (this.handlers[id]) {
      this.handlers[id] = null
    }
  }

  async runFulfilled(input: T) {
    let current = input
    for (const handler of this.handlers) {
      if (!handler) continue
      try {
        current = await handler.fulfilled(current)
      } catch (error) {
        if (handler.rejected) {
          await handler.rejected(error)
        } else {
          throw error
        }
      }
    }
    return current
  }

  async runRejected(error: unknown) {
    for (const handler of this.handlers) {
      if (!handler?.rejected) continue
      const result = await handler.rejected(error)
      if (result) {
        return result
      }
    }
    throw error
  }
}

export type HttpClient = {
  request<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>>
  get<T = unknown>(url: string, config?: RequestOptions): Promise<HttpResponse<T>>
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestOptions,
  ): Promise<HttpResponse<T>>
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestOptions,
  ): Promise<HttpResponse<T>>
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestOptions,
  ): Promise<HttpResponse<T>>
  delete<T = unknown>(
    url: string,
    config?: RequestOptions,
  ): Promise<HttpResponse<T>>
  interceptors: {
    request: InterceptorManager<RequestConfig>
    response: InterceptorManager<HttpResponse>
  }
}

export type FetchLike = typeof fetch

export type FetchProvider = () => Promise<FetchLike>

function isAbsoluteUrl(url: string) {
  return /^https?:\/\//i.test(url)
}

function buildUrl(config: RequestConfig) {
  const url = config.url
  if (isAbsoluteUrl(url)) {
    return appendParams(url, config.params)
  }

  const base = config.baseURL
  if (!base) {
    return appendParams(url, config.params)
  }

  const normalizedBase = base.replace(/\/+$/, "")
  const normalizedUrl = url.replace(/^\/+/, "")
  return appendParams(`${normalizedBase}/${normalizedUrl}`, config.params)
}

function appendParams(url: string, params?: RequestParams) {
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue
    search.append(key, String(value))
  }
  const separator = url.includes("?") ? "&" : "?"
  const query = search.toString()
  return query ? `${url}${separator}${query}` : url
}

function normalizeHeaders(
  defaults?: RequestHeaders,
  overrides?: RequestHeaders,
) {
  return { ...(defaults ?? {}), ...(overrides ?? {}) }
}

function shouldJsonSerialize(data: unknown) {
  if (data === null || data === undefined) return false
  if (typeof data === "string") return false
  if (data instanceof ArrayBuffer) return false
  if (data instanceof Blob) return false
  if (data instanceof FormData) return false
  return typeof data === "object" || typeof data === "number" || typeof data === "boolean"
}

async function parseResponseData(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""
  const isJson =
    contentType.includes("application/json") || contentType.includes("+json")
  if (isJson) {
    return response.json()
  }
  return response.text()
}

function mergeConfig(defaults: RequestDefaults, config: RequestConfig) {
  return {
    ...defaults,
    ...config,
    headers: normalizeHeaders(defaults.headers, config.headers),
  }
}

export function createHttpClientWithFetch(
  defaults: RequestDefaults,
  fetchProvider: FetchProvider,
): HttpClient {
  const requestInterceptors = new InterceptorManager<RequestConfig>()
  const responseInterceptors = new InterceptorManager<HttpResponse>()

  const request = async <T = unknown>(
    config: RequestConfig,
  ): Promise<HttpResponse<T>> => {
    const merged = mergeConfig(defaults, config)
    const finalConfig = await requestInterceptors.runFulfilled(merged)
    const url = buildUrl(finalConfig)

    const headers = new Headers(finalConfig.headers ?? {})
    let body: BodyInit | undefined
    if (finalConfig.data !== undefined) {
      if (shouldJsonSerialize(finalConfig.data)) {
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json")
        }
        body = JSON.stringify(finalConfig.data)
      } else {
        body = finalConfig.data as BodyInit
      }
    }

    const controller =
      finalConfig.signal === undefined ? new AbortController() : null
    const timeout = finalConfig.timeout ?? 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    if (controller && timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout)
    }

    try {
      const fetchImpl = await fetchProvider()
      const response = await fetchImpl(url, {
        method: finalConfig.method ?? "GET",
        headers,
        body,
        signal: finalConfig.signal ?? controller?.signal,
        credentials: finalConfig.withCredentials ? "include" : "omit",
      })

      const data = (await parseResponseData(response)) as T
      const httpResponse: HttpResponse<T> = {
        status: response.status,
        statusText: response.statusText,
        data,
        headers: response.headers,
        config: finalConfig,
        url,
      }

      if (!response.ok) {
        throw new HttpError(
          `Request failed with status ${response.status}`,
          finalConfig,
          httpResponse,
        )
      }

      return (await responseInterceptors.runFulfilled(
        httpResponse,
      )) as HttpResponse<T>
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (error instanceof HttpError) {
        const maybe = await responseInterceptors.runRejected(error)
        return maybe as HttpResponse<T>
      }
      const wrapped = new HttpError(
        error instanceof Error ? error.message : "Request failed",
        finalConfig,
      )
      const maybe = await responseInterceptors.runRejected(wrapped)
      return maybe as HttpResponse<T>
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  const client: HttpClient = {
    interceptors: {
      request: requestInterceptors,
      response: responseInterceptors,
    },
    request,
    get: (url, config) =>
      request({ ...(config || {}), url, method: "GET" }),
    delete: (url, config) =>
      request({ ...(config || {}), url, method: "DELETE" }),
    post: (url, data, config) =>
      request({ ...(config || {}), url, method: "POST", data }),
    put: (url, data, config) =>
      request({ ...(config || {}), url, method: "PUT", data }),
    patch: (url, data, config) =>
      request({ ...(config || {}), url, method: "PATCH", data }),
  }

  return client
}
