import {
  createHttpClientWithFetch,
  type FetchLike,
  type FetchProvider,
  type RequestConfig,
} from "./core"

export type {
  HttpClient,
  HttpError,
  HttpMethod,
  HttpResponse,
  RequestConfig,
  RequestHeaders,
  RequestParams,
} from "./core"

let cachedFetch: FetchLike | null = null

const getFetch: FetchProvider = async () => {
  if (cachedFetch) return cachedFetch
  if (typeof globalThis.fetch === "function") {
    cachedFetch = globalThis.fetch.bind(globalThis)
    return cachedFetch
  }
  const undici = await import("undici")
  cachedFetch = undici.fetch as FetchLike
  return cachedFetch
}

export const createHttpClient = (defaults: RequestConfig) =>
  createHttpClientWithFetch(defaults, getFetch)
