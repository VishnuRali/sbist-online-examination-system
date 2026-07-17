import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuthState = () => {
    console.log('🔐 [AuthContext] Clearing auth state')
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
  }

  const fetchCurrentUser = useCallback(async (tkn) => {
    if (!tkn) {
      clearAuthState()
      setIsLoading(false)
      return
    }
    try {
      const res = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${tkn}` }
      })
      if (localStorage.getItem('token') !== tkn) {
        console.log('⚠️ [AuthContext] Stale /auth/me fetch completed — ignoring')
        return
      }
      const role = res.data.user?.role || res.data.role
      setUser({ ...res.data.user, role })
    } catch (error) {
      if (localStorage.getItem('token') !== tkn) {
        console.log('⚠️ [AuthContext] Stale /auth/me fetch failed — ignoring')
        return
      }
      // Only clear auth state for definitive auth rejections (401/403).
      const status = error?.response?.status
      if (status === 401 || status === 403) {
        console.log('   Token rejected by server (401/403) — clearing auth state')
        clearAuthState()
      } else {
        console.warn('   /auth/me error (non-auth):', status || 'network error', '— keeping session alive')
      }
    } finally {
      if (localStorage.getItem('token') === tkn || !localStorage.getItem('token')) {
        setIsLoading(false)
      }
    }
  }, [])


  useEffect(() => {
    const handleAuthLogout = () => {
      clearAuthState()
    }

    window.addEventListener('auth-logout', handleAuthLogout)
    // Only fetch on mount with the initial token from localStorage.
    // The login() function sets user state directly, so no need to re-fetch on token change.
    fetchCurrentUser(localStorage.getItem('token') || null)
    return () => window.removeEventListener('auth-logout', handleAuthLogout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const login = (userData, authToken) => {
    setToken(authToken)
    setUser({ ...userData, role: userData.role })
    localStorage.setItem('token', authToken)
    sessionStorage.setItem('token', authToken)
  }

  const logout = async () => {
    try {
      if (token) {
        await api.post('/auth/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        })
      }
    } catch {}
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
