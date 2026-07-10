import { useEffect, useState } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { formatDateTime } from '../../utils/helpers'
import { Users, Search, RefreshCw, Key, Power, LogOut, Download, Shield, CloudDownload, X, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Upload, Mail, MailX, UserCheck, UserX } from 'lucide-react'

export default function StudentManager() {
  const [students, setStudents] = useState([])
  const [activeStudents, setActiveStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [departments, setDepartments] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [credModal, setCredModal] = useState(null)
  const [tab, setTab] = useState('all')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncingGForm, setSyncingGForm] = useState(false)
  const [showImportReport, setShowImportReport] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const LIMIT = 15

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSyncing(true)
    setSyncResult(null)
    setShowImportReport(false)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post('/admin/students/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setSyncResult(res.data)
      setShowImportReport(true)
      setShowErrors(false)
      if (res.data.created > 0) {
        toast.success(`Import complete! ${res.data.created} student(s) registered.`)
        load()
      } else {
        toast.success('Import complete — no new students registered')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed')
    } finally {
      setSyncing(false)
      e.target.value = ''
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const [studRes, activeRes, deptRes] = await Promise.all([
        api.get('/admin/students', { params: { search, department: filterDept, page, limit: LIMIT } }),
        api.get('/admin/students/active'),
        api.get('/admin/departments'),
      ])
      setStudents(studRes.data.students)
      setTotal(studRes.data.total)
      setActiveStudents(activeRes.data.students)
      setDepartments(deptRes.data.departments)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, filterDept, page])

  const resetCredentials = async (studentId) => {
    try {
      const res = await api.post(`/admin/students/${studentId}/credentials`)
      setCredModal({ studentId: res.data.studentId, password: res.data.password })
      toast.success('Credentials reset!')
    } catch {
      toast.error('Failed to reset credentials')
    }
  }

  const toggleStatus = async (studentId) => {
    try {
      await api.patch(`/admin/students/${studentId}/toggle`)
      toast.success('Status updated')
      load()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const forceLogout = async (studentId) => {
    try {
      await api.post(`/admin/students/${studentId}/force-logout`)
      toast.success('Student force logged out')
      load()
    } catch {
      toast.error('Failed')
    }
  }

  const exportStudents = async () => {
    try {
      const res = await api.get('/admin/export/students', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = 'students.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  const downloadCSVTemplate = async () => {
    try {
      const res = await api.get('/admin/students/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = 'student_import_template.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download template')
    }
  }

  const handleSyncGoogleForm = async () => {
    setSyncingGForm(true)
    try {
      const res = await api.post('/admin/sync-google-form')
      setSyncResult(res.data)
      if (res.data.created > 0) {
        toast.success(`Sync done! ${res.data.created} new student(s) registered`)
        load()
      } else if (res.data.success) {
        toast.success('Sync complete — no new submissions found')
      } else {
        toast.error(res.data.reason || 'Sync failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.reason || 'Google Form sync failed')
    } finally {
      setSyncingGForm(false)
    }
  }

  const displayStudents = tab === 'active' ? activeStudents : students

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Student Manager</h1>
          <p className="text-slate-400 text-sm">{total} total • {activeStudents.length} currently online</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="btn-secondary btn-sm flex items-center gap-2 text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={downloadCSVTemplate} className="btn-secondary btn-sm flex items-center gap-2 text-xs">
            <Download size={14} /> CSV Template
          </button>
          <label className={`btn-primary btn-sm flex items-center gap-2 text-xs cursor-pointer ${syncing ? 'opacity-50 pointer-events-none' : ''}`}>
            {syncing ? (
              <><div className="spinner w-3 h-3 animate-spin" /> Importing...</>
            ) : (
              <><CloudDownload size={14} /> Import Students (CSV)</>
            )}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCSV}
              disabled={syncing}
            />
          </label>
          <button
            onClick={handleSyncGoogleForm}
            disabled={syncingGForm}
            className="btn-secondary btn-sm flex items-center gap-2 text-xs"
            title="Sync from Google Form"
          >
            {syncingGForm ? <><div className="spinner w-3 h-3" /> Syncing...</> : <><RefreshCw size={14} /> Sync Google Form</>}
          </button>
          <button onClick={exportStudents} className="btn-success btn-sm flex items-center gap-2 text-xs">
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Import progress indicator */}
      {syncing && (
        <div className="glass-card p-5 flex items-center gap-4 border-blue-500/30 bg-blue-500/5">
          <div className="spinner !w-8 !h-8 !border-t-blue-400 flex-shrink-0"></div>
          <div>
            <p className="text-slate-100 font-semibold text-sm">Importing students...</p>
            <p className="text-slate-400 text-xs mt-0.5">This may take a moment for large files. Please wait.</p>
          </div>
        </div>
      )}

      {/* Import result report */}
      {!syncing && showImportReport && syncResult && (
        <div className="glass-card p-5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-400" />
              <span className="text-slate-100 font-semibold">Import Report</span>
            </div>
            <button onClick={() => setShowImportReport(false)} className="btn-icon text-slate-400 hover:text-slate-200"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Imported', value: syncResult.created || 0, icon: UserCheck, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
              { label: 'Skipped', value: syncResult.skipped || 0, icon: UserX, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
              { label: 'Email Sent', value: syncResult.emailsSent || 0, icon: Mail, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
              { label: 'Email Failed', value: syncResult.emailsFailed || 0, icon: MailX, color: 'text-red-400 bg-red-500/15 border-red-500/30' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`flex items-center gap-3 p-3 rounded-xl border ${color}`}>
                <Icon size={18} />
                <div>
                  <p className="text-lg font-bold leading-tight">{value}</p>
                  <p className="text-xs opacity-70">{label}</p>
                </div>
              </div>
            ))}
          </div>
          {syncResult.errors?.length > 0 && (
            <div>
              <button onClick={() => setShowErrors(v => !v)}
                className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                <AlertTriangle size={13} />
                {syncResult.errors.length} warning(s) / error(s)
                {showErrors ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showErrors && (
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                  {syncResult.errors.map((err, i) => (
                    <div key={i} className="text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2">
                      <span className="text-slate-300 font-medium">{typeof err === 'object' ? (err.rollNumber || 'Row ' + (i + 1)) : 'Error'}: </span>
                      {typeof err === 'object' ? err.reason : err}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-800/60 rounded-xl p-1 w-fit">
        {[{ key: 'all', label: `All (${total})` }, { key: 'active', label: `Online (${activeStudents.length})` }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by name, ID, roll number..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input-field pl-10" />
          </div>
          <select value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1) }} className="input-field w-48">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
          </select>
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Year/Sem</th>
                <th>Section</th>
                <th>Status</th>
                {tab === 'active' && <th>Current Exam</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8"><div className="spinner mx-auto"></div></td></tr>
              ) : displayStudents.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-500">No students found</td></tr>
              ) : displayStudents.map(s => (
                <tr key={s._id}>
                  <td><code className="text-blue-400 text-xs">{s.studentId}</code></td>
                  <td><span className="font-medium text-slate-200">{s.name}</span></td>
                  <td className="text-slate-400 text-sm">{s.department?.code}</td>
                  <td className="text-slate-400 text-sm">Y{s.year}/S{s.semester}</td>
                  <td className="text-slate-400 text-sm">{s.section ? `Section ${s.section}` : '—'}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${s.isActive ? 'badge-green' : 'badge-red'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                      {s.isLoggedIn && <span className="badge badge-yellow">Online</span>}
                    </div>
                  </td>
                  {tab === 'active' && <td className="text-slate-400 text-xs">{s.currentExam?.title || '-'}</td>}
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => resetCredentials(s._id)} title="Reset Password"
                        className="btn-icon text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10"><Key size={14} /></button>
                      <button onClick={() => toggleStatus(s._id)} title={s.isActive ? 'Deactivate' : 'Activate'}
                        className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"><Power size={14} /></button>
                      {s.isLoggedIn && (
                        <button onClick={() => forceLogout(s._id)} title="Force Logout"
                          className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10"><LogOut size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {tab === 'all' && total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-400">Showing {((page-1)*LIMIT)+1}–{Math.min(page*LIMIT, total)} of {total}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="btn-secondary btn-sm text-xs disabled:opacity-40">Previous</button>
              <button disabled={page * LIMIT >= total} onClick={() => setPage(p => p+1)} className="btn-secondary btn-sm text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Credentials Modal */}
      {credModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-sm p-6 slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center border border-yellow-500/30">
                <Key size={20} className="text-yellow-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">New Credentials</h2>
            </div>
            <p className="text-slate-400 text-sm mb-4">Save these credentials for the student:</p>
            <div className="space-y-3">
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1">Student ID</p>
                <code className="text-blue-400 font-bold">{credModal.studentId}</code>
              </div>
              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1">New Password</p>
                <code className="text-emerald-400 font-bold text-lg tracking-wider">{credModal.password}</code>
              </div>
            </div>
            <p className="text-amber-300 text-xs mt-3 p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">
              ⚠️ Share this with the student. It won't be shown again.
            </p>
            <button onClick={() => setCredModal(null)} className="btn-primary w-full mt-4">Done</button>
          </div>
        </div>
      )}

      {/* Sync Result Modal */}
      {syncResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4 slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudDownload className="text-blue-400" size={20} />
                <h2 className="text-lg font-bold text-slate-100 font-['Outfit']">Sync Results</h2>
              </div>
              <button onClick={() => setSyncResult(null)} className="btn-icon text-slate-400">
                <X size={18} />
              </button>
            </div>

            {syncResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 text-center">
                    <p className="text-2xl font-bold text-blue-400">{syncResult.created || 0}</p>
                    <p className="text-xs text-slate-400">Total Imported</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 text-center">
                    <p className="text-2xl font-bold text-amber-400">{syncResult.skipped || 0}</p>
                    <p className="text-xs text-slate-400">Duplicates Skipped</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{syncResult.emailsSent || 0}</p>
                    <p className="text-xs text-slate-400">Emails Sent</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 text-center">
                    <p className="text-2xl font-bold text-rose-400">{syncResult.emailsFailed || 0}</p>
                    <p className="text-xs text-slate-400">Emails Failed</p>
                  </div>
                </div>

                {syncResult.errors?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">Sync Errors ({syncResult.errors.length}):</p>
                    <div className="max-h-28 overflow-y-auto bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-1">
                      {syncResult.errors.map((err, i) => (
                        <p key={i} className="text-[11px] text-red-400">
                          Row/Roll {err.rollNumber}: {err.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <AlertTriangle className="text-red-400 flex-shrink-0" size={20} />
                <div>
                  <h4 className="text-sm font-semibold text-red-400">Sync Failed</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{syncResult.reason}</p>
                </div>
              </div>
            )}

            <button onClick={() => setSyncResult(null)} className="btn-primary w-full">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
