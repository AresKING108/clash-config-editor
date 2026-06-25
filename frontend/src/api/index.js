import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const fileAPI = {
  list: () => api.get('/files/list'),
  read: (filename) => api.get(`/files/read/${filename}`),
  save: (filename, config) => api.post('/files/save', { filename, config }),
  upload: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  delete: (filename) => api.delete(`/files/${filename}`)
}

export const configAPI = {
  parse: (content) => api.post('/config/parse', { content }),
  validate: (config) => api.post('/config/validate', { config })
}

// 路由器同步 API
export const routerAPI = {
  status: () => api.get('/router/status'),
  pull: (type) => api.post('/router/pull', { type }),
  push: (files, triggerReload) => api.post('/router/push', { files, triggerReload }),
  reload: (service) => api.post('/router/reload', { service }),
  subconverterStatus: () => api.get('/router/subconverter-status'),
}

export default api
