import axios, { AxiosError } from 'axios'

export const TOKEN_KEY = 'brightloop_token'
export const UNAUTHORIZED_EVENT = 'brightloop:unauthorized'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    return Promise.reject(error)
  },
)

/** Turns any API/network error into a message suitable for the UI. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { error?: string } | undefined
    if (data?.error) return data.error
    if (!error.response) return 'Cannot reach the server. Check your connection.'
  }
  return fallback
}
