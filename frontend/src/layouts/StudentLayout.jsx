import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, FileText, LogOut, GraduationCap, User, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StudentLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showWarning, setShowWarning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)

  const handleLogout = async (auto = false) => {
    await logout()
    if (auto) {
      toast.error('Logged out due to inactivity')
    } else {
      toast.success('Logged out successfully')
    }
    navigate('/login')
  }

  useEffect(() => {
    let warnTimeout
    let logoutTimeout
    let countdownInterval

    const resetTimer = () => {
      setShowWarning(false)
      setTimeLeft(60)

      clearTimeout(warnTimeout)
      clearTimeout(logoutTimeout)
      clearInterval(countdownInterval)

      // Warn after 14 minutes of inactivity (1 minute before logout)
      warnTimeout = setTimeout(() => {
        setShowWarning(true)
        let secondsRemaining = 60
        countdownInterval = setInterval(() => {
          secondsRemaining--
          setTimeLeft(secondsRemaining)
          if (secondsRemaining <= 0) {
            clearInterval(countdownInterval)
            handleLogout(true)
          }
        }, 1000)
      }, 14 * 60 * 1000)

      // Logout after 15 minutes of inactivity
      logoutTimeout = setTimeout(() => {
        handleLogout(true)
      }, 15 * 60 * 1000)
    }

    // Monitor interactions
    const events = ['mousemove', 'keydown', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, resetTimer))

    resetTimer()

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      clearTimeout(warnTimeout)
      clearTimeout(logoutTimeout)
      clearInterval(countdownInterval)
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="college-header shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            {/* College branding */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center border border-white/20">
                <GraduationCap size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white font-['Outfit'] leading-tight">
                  SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY
                </h1>
                <p className="text-blue-200 text-sm font-medium">Online Examination Portal</p>
              </div>
            </div>

            {/* User info */}
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-white font-bold border border-white/30">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{user?.name}</p>
                  <p className="text-xs text-blue-200">{user?.studentId}</p>
                </div>
              </div>
              <button onClick={() => handleLogout(false)} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white text-sm font-medium transition-all">
                <LogOut size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* Navigation tabs */}
          <nav className="flex gap-2 pb-0">
            {[
              { to: '/student', label: 'My Exams', icon: LayoutDashboard, end: true },
              { to: '/student/results', label: 'My Results', icon: FileText },
              { to: '/student/profile', label: 'My Profile', icon: User },
            ].map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-950 text-blue-400'
                      : 'text-blue-100 hover:bg-white/10'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 text-center">
        <p className="text-slate-500 text-sm">
          © {new Date().getFullYear()} Swarna Bharathi Institute of Science and Technology. All rights reserved.
        </p>
      </footer>

      {/* Inactivity Auto Logout warning modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="glass-card max-w-sm w-full p-6 text-center space-y-4 border border-amber-500/30">
            <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20 text-amber-400 mx-auto">
              <ShieldAlert size={28} className="animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 font-['Outfit']">Inactivity Warning</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              You have been inactive for 14 minutes. You will be logged out in <span className="text-amber-400 font-bold font-mono text-base">{timeLeft}</span> seconds.
            </p>
            <button
              onClick={() => {
                // Dispatch click event on window to invoke interaction listener resetTimer
                const evt = new MouseEvent('click')
                window.dispatchEvent(evt)
              }}
              className="btn-primary w-full mt-2"
            >
              Stay Logged In
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
