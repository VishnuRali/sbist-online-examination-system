import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { User, Phone, Lock, Save, BookOpen, GraduationCap, ShieldAlert } from 'lucide-react'

export default function StudentProfile() {
  const { user, setUser } = useAuth()
  const [mobile, setMobile] = useState(user?.mobile || '')
  
  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [savingPhone, setSavingPhone] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const handleUpdatePhone = async (e) => {
    e.preventDefault()
    setSavingPhone(true)
    try {
      const res = await api.put('/student/profile', { mobile })
      toast.success('Phone number updated successfully')
      setUser({ ...user, mobile: res.data.user?.mobile || mobile })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed')
    } finally {
      setSavingPhone(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      return toast.error('New passwords do not match')
    }
    if (newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters long')
    }

    setSavingPassword(true)
    try {
      await api.put('/student/profile', { currentPassword, newPassword })
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Incorrect current password or update failed')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 fade-in">
      {/* Header banner */}
      <div className="glass-card p-6 border border-slate-700/50 flex flex-col md:flex-row items-center gap-6">
        <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 text-blue-400">
          <User size={40} />
        </div>
        <div className="text-center md:text-left flex-1">
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">{user?.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">Student Profile &amp; Settings</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-3 text-xs font-semibold">
            <span className="badge badge-blue">Student ID: {user?.studentId}</span>
            {user?.rollNumber && <span className="badge badge-indigo">Roll No: {user?.rollNumber}</span>}
            <span className="badge badge-green">Active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Academic Details (Read Only) */}
        <div className="glass-card p-6 space-y-4 md:col-span-1 border border-slate-700/50">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-700/50 pb-2">
            <GraduationCap size={18} className="text-blue-400" /> Academic Details
          </h3>
          <div className="space-y-3.5 text-sm">
            <div>
              <p className="text-slate-500 text-xs font-medium">Department</p>
              <p className="text-slate-200 font-semibold mt-0.5">{user?.department?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs font-medium">Department Code</p>
              <p className="text-slate-200 font-semibold mt-0.5">{user?.department?.code || 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs font-medium">Year &amp; Semester</p>
              <p className="text-slate-200 font-semibold mt-0.5">Year {user?.year} / Sem {user?.semester}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs font-medium">Section</p>
              <p className="text-slate-200 font-semibold mt-0.5">Section {user?.section || '—'}</p>
            </div>
            {user?.academicYear && (
              <div>
                <p className="text-slate-500 text-xs font-medium">Academic Year</p>
                <p className="text-slate-200 font-semibold mt-0.5">{user?.academicYear}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500 text-xs font-medium">Registered Email</p>
              <p className="text-slate-200 font-semibold mt-0.5 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Update Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Phone Number Form */}
          <form onSubmit={handleUpdatePhone} className="glass-card p-6 space-y-4 border border-slate-700/50">
            <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-700/50 pb-2">
              <Phone size={18} className="text-emerald-400" /> Update Phone Number
            </h3>
            <div className="flex gap-4 items-end flex-wrap sm:flex-nowrap">
              <div className="flex-1 w-full">
                <label className="input-label">Mobile Number</label>
                <input
                  type="tel"
                  className="input-field"
                  placeholder="e.g. 9876543210"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={savingPhone}
                className="btn-primary flex items-center justify-center gap-2 px-6 shrink-0 h-10 w-full sm:w-auto"
              >
                {savingPhone ? <><div className="spinner !w-4 !h-4 !border-t-white" /> Saving...</> : <><Save size={16} /> Save</>}
              </button>
            </div>
          </form>

          {/* Password Update Form */}
          <form onSubmit={handleUpdatePassword} className="glass-card p-6 space-y-4 border border-slate-700/50">
            <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-700/50 pb-2">
              <Lock size={18} className="text-indigo-400" /> Update Password
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="input-label">Current Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="input-label">New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="input-label">Confirm New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPassword}
                className="btn-primary flex items-center justify-center gap-2 px-6 w-full sm:w-auto"
              >
                {savingPassword ? <><div className="spinner !w-4 !h-4 !border-t-white" /> Updating...</> : <><Lock size={16} /> Update Password</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
