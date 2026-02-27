import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
})

// Request interceptor: attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 handler registration
let onUnauthorized = null

export function setOnUnauthorized(callback) {
  onUnauthorized = callback
}

// Response interceptor: catch expired/invalid tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && onUnauthorized) {
      localStorage.removeItem('token')
      onUnauthorized()
    }
    return Promise.reject(error)
  }
)

export default api