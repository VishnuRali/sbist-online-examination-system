import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { GraduationCap, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react'



export default function Login() {
  const [mode, setMode] = useState('student') // 'student' | 'admin'
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('🔐 [Login] Submit login', { mode, studentId: form.identifier })
    setLoading(true)
    try {
      let endpoint, payload
      if (mode === 'admin') {
        endpoint = '/auth/admin/login'
        payload = { email: form.identifier, password: form.password }
      } else {
        endpoint = '/auth/student/login'
        // Send strictly studentId and password
        payload = { studentId: form.identifier, password: form.password }
      }

      console.log('🔐 [Login] Sending login request', { endpoint, payload })
      const res = await api.post(endpoint, payload)
      console.log('🔐 [Login] Login success', {
        role: mode,
        forcePasswordChange: res.data.forcePasswordChange,
        tokenExists: !!res.data.token
      })
      login(res.data.user, res.data.token)
      toast.success(`Welcome, ${res.data.user.name}!`)
      navigate(mode === 'admin' ? '/admin' : '/student', { replace: true })
    } catch (err) {
      console.log('🔐 [Login] Login failed', { message: err.response?.data?.message, status: err.response?.status })
      toast.error(err.response?.data?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="college-header py-8 px-6 text-center relative">
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center border border-white/25 shadow-xl">
            <GraduationCap size={32} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white font-['Outfit']">
          SWARNA BHARATHI INSTITUTE
        </h1>
        <p className="text-lg font-semibold text-white/80 font-['Outfit']">OF SCIENCE AND TECHNOLOGY</p>
        <p className="text-blue-200 text-sm mt-1">Online Examination Portal</p>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md fade-in">
          <div className="glass-card p-8 shadow-2xl">
            {/* Mode toggle */}
            <div className="flex bg-slate-800/80 rounded-xl p-1 mb-6">
              {['student', 'admin'].map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m)
                    setForm(m === 'admin' ? { ...ADMIN_PREFILL } : { ...STUDENT_PREFILL })
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === m
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {m === 'admin' ? <ShieldCheck size={16} /> : <GraduationCap size={16} />}
                  {m.charAt(0).toUpperCase() + m.slice(1)} Login
                </button>
              ))}
            </div>

            <h2 className="text-xl font-bold text-slate-100 mb-5">
              {mode === 'admin' ? 'Admin Sign In' : 'Student Sign In'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="input-label">
                  {mode === 'admin' ? 'Email Address' : 'Student ID / Roll Number'}
                </label>
                <input
                  type={mode === 'admin' ? 'email' : 'text'}
                  value={form.identifier}
                  onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                  placeholder={mode === 'admin' ? 'admin@sbit.edu' : 'Enter Student ID or Roll Number'}
                  className="input-field"
                  required
                  autoFocus
                />
                {mode === 'student' && (
                  <p className="text-xs text-slate-500 mt-1">
                    💡 Log in using your Student ID or Roll Number
                  </p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="input-label !mb-0">Password</label>
                  {mode === 'student' && (
                    <Link to="/forgot-password" className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                      Forgot Password?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Enter your password"
                    className="input-field pr-12"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
                {loading ? (
                  <><div className="spinner !w-5 !h-5 !border-t-white" /> Signing in...</>
                ) : (
                  <><LogIn size={18} /> Sign In</>
                )}
              </button>
            </form>
          </div>

          {/* Info box */}
          <div className="mt-4 glass-card p-4">
            <p className="text-xs text-slate-400 text-center">
              {mode === 'student'
                ? '📧 Your login credentials were sent to your email after Google Form submission'
                : '🔒 This portal is restricted to authorized administrators only'
              }
            </p>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center">
        <p className="text-slate-600 text-xs">
          © {new Date().getFullYear()} Swarna Bharathi Institute of Science and Technology
        </p>
      </footer>
    </div>
  )
}
