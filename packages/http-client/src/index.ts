import {
  createHttpClientWithFetch,
  type FetchLike,
  type FetchProvider,
  type RequestDefaults,
} from "./core"

export type {
  HttpClient,
  HttpMethod,
  HttpResponse,
  RequestConfig,
  RequestDefaults,
  RequestOptions,
  RequestHeaders,
  RequestParams,
} from "./core"

export { HttpError } from "./core"

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

export const createHttpClient = (defaults: RequestDefaults) =>
  createHttpClientWithFetch(defaults, getFetch)
