import { BUILD_API_BASE_URL } from '../generated/build-config'

const DEFAULT_API_BASE_URL = 'http://localhost:3001/api/v1'

function normalizeValue(value: string | undefined | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const API_BASE_URL =
  normalizeValue(process.env.NEXT_PUBLIC_API_URL) ??
  normalizeValue(process.env.DESKTOP_API_URL) ??
  normalizeValue(BUILD_API_BASE_URL) ??
  DEFAULT_API_BASE_URL
