import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, BookOpen, Users, FileText, Building2,
  BookMarked, LogOut, Menu, X, GraduationCap,
  Bell, Shield, Mail, ShieldCheck, Settings as SettingsIcon, Tv
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const isSuperAdmin = user?.role === 'super_admin'

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/exams', label: 'Exams', icon: BookOpen },
    { to: '/admin/students', label: 'Students', icon: Users },
    { to: '/admin/results', label: 'Results', icon: FileText },
    { to: '/admin/live-monitor', label: 'Live Monitor', icon: Tv },
    { to: '/admin/departments', label: 'Departments', icon: Building2 },
    { to: '/admin/subjects', label: 'Subjects', icon: BookMarked },
    { to: '/admin/email-logs', label: 'Email Logs', icon: Mail },
    ...(isSuperAdmin ? [
      { to: '/admin/admins', label: 'Admin Management', icon: ShieldCheck },
      { to: '/admin/settings', label: 'Mail Settings', icon: SettingsIcon }
    ] : []),
  ]

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-300 flex flex-col bg-slate-900/95 border-r border-slate-700/50 flex-shrink-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-700/50 min-h-[72px]">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <GraduationCap size={20} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-blue-400 leading-tight">SBIST</p>
              <p className="text-[10px] text-slate-500 leading-tight">
                {isSuperAdmin ? 'Super Admin' : 'Admin Portal'}
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span className="font-medium text-sm">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-slate-700/50">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/50">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${isSuperAdmin ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{isSuperAdmin ? '⭐ Super Admin' : user?.email}</p>
              </div>
              <button onClick={handleLogout} className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10" title="Logout">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex items-center justify-center py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="btn-icon text-slate-400 hover:text-slate-200 hover:bg-slate-700/50">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-100 font-['Outfit']">
                SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY
              </h1>
              <p className="text-xs text-slate-500">Online Examination Portal — Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full ${isSuperAdmin ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${isSuperAdmin ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className={`text-xs font-medium ${isSuperAdmin ? 'text-amber-400' : 'text-emerald-400'}`}>
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
