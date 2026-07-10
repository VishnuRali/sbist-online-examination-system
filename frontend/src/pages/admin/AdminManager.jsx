import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import {
  Users, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Key, Eye, EyeOff, X, Shield, ShieldCheck, ClipboardList,
  Search, RefreshCw, ChevronDown
} from 'lucide-react'

const DEPT_OPTIONS = [
  'Administration', 'Computer Science', 'Information Technology',
  'Electronics', 'Mechanical', 'Civil', 'Electrical', 'Chemistry',
  'Physics', 'Mathematics', 'Management', 'Other'
]

const emptyForm = {
  name: '', employeeId: '', email: '', mobile: '',
  department: 'Administration', role: 'admin', password: ''
}

export default function AdminManager() {
  const { user } = useAuth()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editAdmin, setEditAdmin] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  // Logs modal
  const [logsAdmin, setLogsAdmin] = useState(null)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  // Reset password modal
  const [resetResult, setResetResult] = useState(null)

  const isSuperAdmin = user?.role === 'super_admin'

  const fetchAdmins = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/admin/admins')
      setAdmins(res.data.admins || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load admins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAdmins() }, [fetchAdmins])

  const openCreate = () => {
    setEditAdmin(null)
    setForm(emptyForm)
    setShowPwd(false)
    setShowModal(true)
  }

  const openEdit = (admin) => {
    setEditAdmin(admin)
    setForm({
      name: admin.name || '',
      employeeId: admin.employeeId || '',
      email: admin.email || '',
      mobile: admin.mobile || '',
      department: admin.department || 'Administration',
      role: admin.role || 'admin',
      password: ''
    })
    setShowPwd(false)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.employeeId || !form.email || !form.mobile || (!editAdmin && !form.password)) {
      toast.error('Please fill all required fields')
      return
    }
    setSaving(true)
    try {
      if (editAdmin) {
        const payload = { ...form }
        if (!payload.password) delete payload.password
        await api.put(`/admin/admins/${editAdmin._id}`, payload)
        toast.success('Admin updated successfully')
      } else {
        await api.post('/admin/admins', form)
        toast.success('Admin created successfully')
      }
      setShowModal(false)
      fetchAdmins()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (admin) => {
    if (!confirm(`Delete admin "${admin.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/admins/${admin._id}`)
      toast.success('Admin deleted')
      fetchAdmins()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed')
    }
  }

  const handleToggle = async (admin) => {
    try {
      await api.patch(`/admin/admins/${admin._id}/toggle`)
      toast.success(`Admin ${admin.isActive ? 'disabled' : 'enabled'}`)
      fetchAdmins()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Toggle failed')
    }
  }

  const handleResetPassword = async (admin) => {
    if (!confirm(`Reset password for "${admin.name}"?`)) return
    try {
      const res = await api.post(`/admin/admins/${admin._id}/reset-password`)
      setResetResult(res.data)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed')
    }
  }

  const openLogs = async (admin) => {
    setLogsAdmin(admin)
    setLogsLoading(true)
    try {
      const res = await api.get(`/admin/admins/${admin._id}/logs`)
      setLogs(res.data.logs || [])
    } catch {
      toast.error('Failed to load activity logs')
    } finally {
      setLogsLoading(false)
    }
  }

  const filtered = admins.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase()) ||
    a.employeeId?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Admin Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage administrator accounts — Super Admin only</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchAdmins} className="btn-secondary btn-sm flex gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
          {isSuperAdmin && (
            <button onClick={openCreate} className="btn-primary btn-sm flex gap-2">
              <Plus size={14} /> Add Admin
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input-field pl-9"
          placeholder="Search by name, email, employee ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Employee ID</th>
                <th>Department</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="spinner mx-auto mb-2" />
                  <p className="text-slate-500">Loading admins...</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-500">No admins found</td></tr>
              ) : filtered.map(admin => (
                <tr key={admin._id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white ${admin.role === 'super_admin' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                        {admin.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{admin.name}</p>
                        <p className="text-xs text-slate-500">{admin.email}</p>
                        <p className="text-xs text-slate-600">{admin.mobile}</p>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-slate-300">{admin.employeeId}</td>
                  <td className="text-slate-300 text-sm">{admin.department}</td>
                  <td>
                    <span className={`badge ${admin.role === 'super_admin' ? 'badge-yellow' : 'badge-blue'} flex items-center gap-1`}>
                      {admin.role === 'super_admin' ? <ShieldCheck size={11} /> : <Shield size={11} />}
                      {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${admin.isActive ? 'badge-green' : 'badge-red'}`}>
                      {admin.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="text-slate-500 text-xs">
                    {admin.lastLogin ? new Date(admin.lastLogin).toLocaleString('en-IN') : 'Never'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(admin)} className="btn-icon text-blue-400 hover:bg-blue-500/10" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => openLogs(admin)} className="btn-icon text-purple-400 hover:bg-purple-500/10" title="Activity Logs">
                        <ClipboardList size={14} />
                      </button>
                      {isSuperAdmin && admin.role !== 'super_admin' && (
                        <>
                          <button onClick={() => handleToggle(admin)} className={`btn-icon ${admin.isActive ? 'text-amber-400 hover:bg-amber-500/10' : 'text-green-400 hover:bg-green-500/10'}`} title={admin.isActive ? 'Disable' : 'Enable'}>
                            {admin.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          </button>
                          <button onClick={() => handleResetPassword(admin)} className="btn-icon text-cyan-400 hover:bg-cyan-500/10" title="Reset Password">
                            <Key size={14} />
                          </button>
                          <button onClick={() => handleDelete(admin)} className="btn-icon text-red-400 hover:bg-red-500/10" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg p-6 space-y-4 slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100">{editAdmin ? 'Edit Admin' : 'Add Admin'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-icon text-slate-400"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Full Name *', key: 'name', type: 'text', placeholder: 'e.g., Dr. John Smith' },
                { label: 'Employee ID *', key: 'employeeId', type: 'text', placeholder: 'e.g., EMP001' },
                { label: 'Email *', key: 'email', type: 'email', placeholder: 'admin@sbist.edu', col: 'full' },
                { label: 'Mobile Number *', key: 'mobile', type: 'tel', placeholder: '9876543210' },
              ].map(f => (
                <div key={f.key} className={f.col === 'full' ? 'col-span-2' : ''}>
                  <label className="input-label">{f.label}</label>
                  <input
                    type={f.type} className="input-field" placeholder={f.placeholder}
                    value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="input-label">Department *</label>
                <select className="input-field" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                  {DEPT_OPTIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Role</label>
                <select className="input-field" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="admin">Admin</option>
                  {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                </select>
              </div>
              <div className="col-span-2">
                <label className="input-label">{editAdmin ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'} className="input-field pr-10"
                    placeholder={editAdmin ? 'Leave blank to keep current password' : 'Min 6 characters'}
                    value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPwd(!showPwd)}>
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? <><div className="spinner w-4 h-4 mr-2" />Saving...</> : (editAdmin ? 'Update Admin' : 'Create Admin')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Result Modal */}
      {resetResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm p-6 text-center space-y-4 slide-up">
            <div className="w-14 h-14 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto">
              <Key size={24} className="text-cyan-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-100">Password Reset</h3>
            <p className="text-slate-400 text-sm">New credentials for <strong>{resetResult.adminName}</strong></p>
            <div className="bg-slate-800/80 rounded-xl p-4 space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Email</span>
                <span className="text-slate-200 font-mono text-sm">{resetResult.adminEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">New Password</span>
                <span className="text-cyan-400 font-mono font-bold tracking-wider">{resetResult.newPassword}</span>
              </div>
            </div>
            <p className="text-xs text-amber-400">⚠️ Share these credentials securely. They won't be shown again.</p>
            <button onClick={() => setResetResult(null)} className="btn-primary w-full">Done</button>
          </div>
        </div>
      )}

      {/* Activity Logs Modal */}
      {logsAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl p-6 space-y-4 max-h-[80vh] flex flex-col slide-up">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Activity Logs</h2>
                <p className="text-slate-500 text-sm">{logsAdmin.name} ({logsAdmin.email})</p>
              </div>
              <button onClick={() => setLogsAdmin(null)} className="btn-icon text-slate-400"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {logsLoading ? (
                <div className="text-center py-8"><div className="spinner mx-auto" /></div>
              ) : logs.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No activity logs found</p>
              ) : logs.map((log, i) => (
                <div key={i} className="flex gap-3 py-3 border-b border-slate-700/50 last:border-0">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-slate-200 text-sm font-medium">{log.action?.replace(/_/g, ' ')}</p>
                    <p className="text-slate-500 text-xs">{log.details}</p>
                    {log.ip && <p className="text-slate-600 text-xs">IP: {log.ip}</p>}
                  </div>
                  <span className="text-slate-600 text-xs flex-shrink-0">
                    {new Date(log.timestamp).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
