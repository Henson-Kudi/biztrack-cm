import {
  createHttpClientWithFetch,
  type FetchLike,
  type FetchProvider,
  type RequestDefaults,
} from "./core"

export type {
  HttpClient,
  HttpError,
  HttpMethod,
  HttpResponse,
  RequestConfig,
  RequestDefaults,
  RequestOptions,
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
  throw new Error(
    "Global fetch is not available in this environment. Please provide a fetch polyfill.",
  )
}

export const createHttpClient = (defaults: RequestDefaults) =>
  createHttpClientWithFetch(defaults, getFetch)
