import { createHttpClient } from '@biztrack/http-client/react-native'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export const apiClient = createHttpClient({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  // Token injection will be added with auth store
  return config
})
