import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { GraduationCap, ShieldAlert, Lock, CheckCircle } from 'lucide-react'

export default function ForcePasswordChange() {
  const { user, setUser, login } = useAuth()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      return toast.error('New passwords do not match')
    }
    if (form.newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters long')
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/student/force-change-password', form)
      toast.success('Password updated successfully! Welcome to your dashboard.')
      
      // Update token and user from server response for a clean session
      if (res.data.token && res.data.user) {
        login({ ...res.data.user, role: 'student' }, res.data.token)
      } else if (user) {
        // Fallback: patch local state if server didn't return new token
        setUser({ ...user, isPasswordChanged: true })
      }
      const redirectTo = res.data.redirectTo || '/student/dashboard'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="college-header py-8 px-6 text-center relative z-10">
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

      {/* Form content */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md fade-in">
          <div className="glass-card p-8 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400 mb-4 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
              <ShieldAlert size={20} className="shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">Change Initial Password</h3>
                <p className="text-[11px] text-amber-300/80">For security, you must update the temporary password sent to your email before continuing.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="input-label">Current Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter your current temporary password"
                  value={form.currentPassword}
                  onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="input-label">New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Create a new secure password"
                  value={form.newPassword}
                  onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="input-label">Confirm New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Confirm your new password"
                  value={form.confirmPassword}
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-6"
              >
                {loading ? (
                  <><div className="spinner !w-5 !h-5 !border-t-white" /> Saving password...</>
                ) : (
                  <><Lock size={16} /> Update Password</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center relative z-10">
        <p className="text-slate-600 text-xs">
          © {new Date().getFullYear()} Swarna Bharathi Institute of Science and Technology
        </p>
      </footer>
    </div>
  )
}
