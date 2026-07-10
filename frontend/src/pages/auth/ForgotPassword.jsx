import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { GraduationCap, Mail, Key, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react'

export default function ForgotPassword() {
  const [step, setStep] = useState(1) // 1: ID+Email, 2: OTP, 3: Reset
  const [form, setForm] = useState({ studentId: '', email: '', otp: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [timer, setTimer] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer(t => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [timer])

  const handleSendOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', {
        studentId: form.studentId,
        email: form.email
      })
      toast.success(res.data.message || 'OTP sent successfully!')
      setStep(2)
      setTimer(60) // 60s cooldown for resend
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/verify-otp', {
        studentId: form.studentId,
        email: form.email,
        otp: form.otp
      })
      toast.success('OTP verified successfully!')
      setStep(3)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired OTP')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      return toast.error('Passwords do not match')
    }
    if (form.newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters long')
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        studentId: form.studentId,
        email: form.email,
        otp: form.otp,
        newPassword: form.newPassword
      })
      toast.success('Password reset successfully! You can now sign in.')
      navigate('/login')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset password failed')
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

      {/* Form Card */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md fade-in">
          <div className="glass-card p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Link to="/login" className="text-slate-400 hover:text-slate-200 mr-1 transition-colors">
                <ArrowLeft size={20} />
              </Link>
              <h2 className="text-xl font-bold text-slate-100">
                {step === 1 && 'Reset Password'}
                {step === 2 && 'Enter Verification Code'}
                {step === 3 && 'Create New Password'}
              </h2>
            </div>

            {step === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter your Student ID and registered Email Address. We will email you a 6-digit verification code.
                </p>
                <div>
                  <label className="input-label">Student ID</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. SBIT-CSE-2026-001"
                    value={form.studentId}
                    onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="input-label">Email Address</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="e.g. student@sbit.edu"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? <><div className="spinner !w-5 !h-5 !border-t-white" /> Sending OTP...</> : 'Send OTP'}
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  We have sent a verification code to <span className="text-blue-400 font-semibold">{form.email}</span>. Code is valid for 10 minutes.
                </p>
                <div>
                  <label className="input-label">Enter 6-Digit OTP</label>
                  <input
                    type="text"
                    className="input-field font-mono tracking-widest text-center text-lg font-bold"
                    maxLength={6}
                    placeholder="123456"
                    value={form.otp}
                    onChange={e => setForm(f => ({ ...f, otp: e.target.value.replace(/\D/g, '') }))}
                    required
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Didn't receive code?</span>
                  {timer > 0 ? (
                    <span>Resend in {timer}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw size={12} /> Resend OTP
                    </button>
                  )}
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </button>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  OTP verified! Create a new secure password for your account.
                </p>
                <div>
                  <label className="input-label">New Password</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="At least 6 characters"
                    value={form.newPassword}
                    onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="input-label">Confirm Password</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Verify new password"
                    value={form.confirmPassword}
                    onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    required
                    minLength={6}
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Resetting Password...' : 'Reset Password'}
                </button>
              </form>
            )}
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
