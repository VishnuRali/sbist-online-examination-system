import axios from 'axios'

let devBaseURL = '/api';
let prodBaseURL = import.meta.env.VITE_API_URL || '/api';
if (prodBaseURL && !prodBaseURL.endsWith('/api') && !prodBaseURL.endsWith('/api/')) {
  prodBaseURL = prodBaseURL.replace(/\/$/, '') + '/api';
}
const baseURL = import.meta.env.DEV ? devBaseURL : prodBaseURL;
const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

/**
 * Response interceptor — auth error handling.
 *
 * RULES (root-cause fix for logout-on-exam-submit bug):
 *
 * 1. Exam-related routes (/student/exams/*) NEVER trigger a logout,
 *    even on 401. The exam page manages its own error handling.
 *    A 401 during save-progress or violation-report must not destroy
 *    the user's session — it may be a transient network issue.
 *
 * 2. Only /auth/* routes that return 401/403 cause a soft session clear.
 *    We dispatch 'auth-logout' (a CustomEvent), letting AuthContext
 *    and React Router handle the redirect — never window.location.href.
 *
 * 3. We NEVER do a hard window.location redirect from this interceptor.
 *    Hard redirects bypass React Router, remount the entire app, and
 *    can interrupt in-flight requests (like exam submission).
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const status = error.response?.status

    // ── Exam routes: never auto-logout, just propagate the error ──────────
    // The exam page (ExamPage.jsx) has its own error handling.
    // A 401 on save-progress, violation, or submit must NOT clear the session.
    const isExamRoute = url.includes('/student/exams/')
    if (isExamRoute) {
      return Promise.reject(error)
    }

    // ── Auth routes: 401/403 → soft session clear (no hard redirect) ──────
    // Dispatching 'auth-logout' lets AuthContext.clearAuthState() run,
    // then ProtectedRoute redirects via React Router <Navigate>.
    const isAuthRoute = url.includes('/auth/')
    if (isAuthRoute && (status === 401 || status === 403)) {
      const authHeader = error.config?.headers?.Authorization || ''
      const sentToken = authHeader.replace('Bearer ', '').trim()
      const currentToken = (localStorage.getItem('token') || '').trim()

      if (sentToken && sentToken === currentToken) {
        console.warn('[API] Current auth session rejected by server — dispatching auth-logout')
        localStorage.removeItem('token')
        sessionStorage.removeItem('token')
        window.dispatchEvent(new CustomEvent('auth-logout'))
      } else {
        console.log('[API] Stale auth request rejected — ignoring logout dispatch')
      }
    }

    return Promise.reject(error)
  }
)

export default api
