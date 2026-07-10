import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { formatDateTime } from '../../utils/helpers'
import {
  Users, Search, RefreshCw, Key, Power, LogOut, Download, CloudDownload,
  X, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Upload, Mail, MailX,
  UserCheck, UserX, Edit3, ClipboardList, ChevronLeft, ChevronRight,
  GraduationCap, TrendingUp, ToggleLeft, ToggleRight, Filter, Shield
} from 'lucide-react'

// ─── Debounce hook ───────────────────────────────────────────
function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debouncedValue
}

// ─── Edit Student Modal ───────────────────────────────────────
function EditStudentModal({ student, departments, onClose, onSaved }) {
  const [form, setForm] = useState({
    department: student.department?._id || '',
    year: student.year || '1',
    semester: student.semester || '1',
    section: student.section || '',
    rollNumber: student.rollNumber || '',
    email: student.email || '',
    mobile: student.mobile || '',
    isActive: student.isActive,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await api.put(`/admin/students/${student._id}`, form)
      toast.success(res.data.message || 'Student updated')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, type = 'text', opts = null) => (
    <div key={key}>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {opts ? (
        <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input-field text-sm">
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input-field text-sm" />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-lg p-6 slide-up">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
              <Edit3 size={18} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-['Outfit']">Edit Student</h2>
              <p className="text-xs text-slate-400">{student.studentId} · {student.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon text-slate-400"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">Department</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="input-field text-sm">
              <option value="">Select Department</option>
              {departments.map(d => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
            </select>
          </div>
          {field('Year', 'year', 'text', [
            { value: '1', label: 'Year 1' }, { value: '2', label: 'Year 2' },
            { value: '3', label: 'Year 3' }, { value: '4', label: 'Year 4' },
          ])}
          {field('Semester', 'semester', 'text', [
            { value: '1', label: 'Semester 1' }, { value: '2', label: 'Semester 2' },
          ])}
          {field('Section', 'section', 'text', [
            { value: '', label: '— None —' },
            { value: 'A', label: 'Section A' }, { value: 'B', label: 'Section B' },
            { value: 'C', label: 'Section C' }, { value: 'D', label: 'Section D' },
            { value: 'E', label: 'Section E' },
          ])}
          {field('Roll Number', 'rollNumber')}
          {field('Email', 'email', 'email')}
          {field('Mobile', 'mobile', 'tel')}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
            <select value={String(form.isActive)} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'true' }))} className="input-field text-sm">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-4">
          ⚠️ Changing department/year/semester/section immediately updates exam eligibility for this student.
        </p>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <><div className="spinner w-4 h-4" />Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Audit Log Drawer ─────────────────────────────────────────
function AuditLogDrawer({ student, onClose }) {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/admin/students/${student._id}/audit-log`).then(res => {
      setLog(res.data.log || [])
    }).catch(() => toast.error('Failed to load audit log')).finally(() => setLoading(false))
  }, [student._id])

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-2xl p-6 slide-up max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center border border-violet-500/30">
              <ClipboardList size={18} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-['Outfit']">Audit Log</h2>
              <p className="text-xs text-slate-400">{student.studentId} · {student.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon text-slate-400"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-10"><div className="spinner" /></div>
          ) : log.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <ClipboardList size={40} className="mx-auto mb-2 opacity-30" />
              <p>No audit history yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {log.map((entry, i) => (
                <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700/50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">{entry.field}</span>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-sm text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">{entry.oldValue}</span>
                        <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                        <span className="text-sm text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">{entry.newValue}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-400">{entry.changedBy}</p>
                      <p className="text-[10px] text-slate-500 capitalize">{entry.changedByRole?.replace('_', ' ')}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{entry.changedAt ? new Date(entry.changedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Bulk Action Modal ────────────────────────────────────────
function BulkActionModal({ action, selectedCount, departments, onConfirm, onClose }) {
  const [value, setValue] = useState('')
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    setConfirming(true)
    await onConfirm(value)
    setConfirming(false)
  }

  const requiresValue = ['department', 'year', 'semester', 'section'].includes(action)

  const actionMeta = {
    department: { label: 'Change Department', icon: GraduationCap, color: 'blue' },
    year: { label: 'Change Year', icon: TrendingUp, color: 'indigo' },
    semester: { label: 'Change Semester', icon: TrendingUp, color: 'indigo' },
    section: { label: 'Change Section', icon: Users, color: 'purple' },
    activate: { label: 'Activate Students', icon: ToggleRight, color: 'emerald' },
    deactivate: { label: 'Deactivate Students', icon: ToggleLeft, color: 'red' },
    promoteYear: { label: 'Promote to Next Year', icon: TrendingUp, color: 'amber' },
  }
  const meta = actionMeta[action] || { label: action, icon: Users, color: 'blue' }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-md p-6 slide-up">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 bg-${meta.color}-500/20 rounded-xl flex items-center justify-center border border-${meta.color}-500/30`}>
            <meta.icon size={18} className={`text-${meta.color}-400`} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 font-['Outfit']">{meta.label}</h2>
            <p className="text-xs text-slate-400">{selectedCount} student{selectedCount > 1 ? 's' : ''} selected</p>
          </div>
        </div>

        {action === 'promoteYear' && (
          <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
            ⚠️ This will promote all selected students' year by 1. Students already in Year 4 will not be changed.
          </p>
        )}
        {(action === 'activate' || action === 'deactivate') && (
          <p className="text-sm text-slate-400 mb-4">
            This will {action} all {selectedCount} selected student{selectedCount > 1 ? 's' : ''}.
          </p>
        )}

        {action === 'department' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Department</label>
            <select value={value} onChange={e => setValue(e.target.value)} className="input-field">
              <option value="">Choose...</option>
              {departments.map(d => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
            </select>
          </div>
        )}
        {action === 'year' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Year</label>
            <select value={value} onChange={e => setValue(e.target.value)} className="input-field">
              <option value="">Choose...</option>
              {['1','2','3','4'].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
        )}
        {action === 'semester' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Semester</label>
            <select value={value} onChange={e => setValue(e.target.value)} className="input-field">
              <option value="">Choose...</option>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
        )}
        {action === 'section' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Section</label>
            <select value={value} onChange={e => setValue(e.target.value)} className="input-field">
              <option value="">Choose...</option>
              {['A','B','C','D','E'].map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={confirming || (requiresValue && !value)}
            className={`btn-primary flex-1 flex items-center justify-center gap-2 ${action === 'deactivate' ? '!bg-red-600 hover:!bg-red-700' : ''}`}
          >
            {confirming ? <><div className="spinner w-4 h-4" />Processing...</> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function StudentManager() {
  const [students, setStudents] = useState([])
  const [activeStudents, setActiveStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterSem, setFilterSem] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
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
  const [showFilters, setShowFilters] = useState(false)

  // Selection state
  const [selected, setSelected] = useState(new Set())
  const [bulkAction, setBulkAction] = useState(null)

  // Modals
  const [editingStudent, setEditingStudent] = useState(null)
  const [auditStudent, setAuditStudent] = useState(null)

  const LIMIT = 15
  const debouncedSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [studRes, activeRes, deptRes] = await Promise.all([
        api.get('/admin/students', { params: { search: debouncedSearch, department: filterDept, year: filterYear, semester: filterSem, section: filterSection, status: filterStatus, page, limit: LIMIT } }),
        api.get('/admin/students/active'),
        api.get('/admin/departments'),
      ])
      setStudents(studRes.data.students)
      setTotal(studRes.data.total)
      setActiveStudents(activeRes.data.students)
      setDepartments(deptRes.data.departments)
      setSelected(new Set()) // clear selection on reload
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filterDept, filterYear, filterSem, filterSection, filterStatus, page])

  useEffect(() => { load() }, [load])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [debouncedSearch, filterDept, filterYear, filterSem, filterSection, filterStatus])

  // ── Student actions ──
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

  // ── Export ──
  const exportStudents = async () => {
    try {
      const res = await api.get('/admin/export/students', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = 'students.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  const exportSelected = async () => {
    try {
      const studentIds = [...selected]
      const res = await api.post('/admin/students/export-selected', { studentIds }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = 'selected_students.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  const downloadCSVTemplate = async () => {
    try {
      const res = await api.get('/admin/students/csv-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = 'student_import_template.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Failed to download template') }
  }

  // ── CSV Import ──
  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSyncing(true); setSyncResult(null); setShowImportReport(false)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.post('/admin/students/import-csv', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSyncResult(res.data); setShowImportReport(true); setShowErrors(false)
      if (res.data.created > 0) { toast.success(`Import complete! ${res.data.created} student(s) registered.`); load() }
      else toast.success('Import complete — no new students registered')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed')
    } finally {
      setSyncing(false); e.target.value = ''
    }
  }

  // ── Google Form Sync ──
  const handleSyncGoogleForm = async () => {
    setSyncingGForm(true)
    try {
      const res = await api.post('/admin/sync-google-form')
      setSyncResult(res.data)
      if (res.data.created > 0) { toast.success(`Sync done! ${res.data.created} new student(s) registered`); load() }
      else if (res.data.success) toast.success('Sync complete — no new submissions found')
      else toast.error(res.data.reason || 'Sync failed')
    } catch (err) {
      toast.error(err.response?.data?.reason || 'Google Form sync failed')
    } finally { setSyncingGForm(false) }
  }

  // ── Selection helpers ──
  const allPageIds = students.map(s => s._id)
  const allSelected = allPageIds.length > 0 && allPageIds.every(id => selected.has(id))
  const someSelected = allPageIds.some(id => selected.has(id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); allPageIds.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); allPageIds.forEach(id => n.add(id)); return n })
    }
  }
  const toggleOne = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Bulk action confirm ──
  const handleBulkConfirm = async (value) => {
    try {
      const res = await api.post('/admin/students/bulk-update', {
        studentIds: [...selected],
        action: bulkAction,
        value,
      })
      toast.success(res.data.message)
      setBulkAction(null)
      setSelected(new Set())
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk update failed')
    }
  }

  const displayStudents = tab === 'active' ? activeStudents : students
  const activeFilterCount = [filterDept, filterYear, filterSem, filterSection, filterStatus].filter(Boolean).length

  return (
    <div className="space-y-6 fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Student Manager</h1>
          <p className="text-slate-400 text-sm">{total} total · {activeStudents.length} currently online</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={load} className="btn-secondary btn-sm flex items-center gap-2 text-xs"><RefreshCw size={14} /> Refresh</button>
          <button onClick={downloadCSVTemplate} className="btn-secondary btn-sm flex items-center gap-2 text-xs"><Download size={14} /> CSV Template</button>
          <label className={`btn-primary btn-sm flex items-center gap-2 text-xs cursor-pointer ${syncing ? 'opacity-50 pointer-events-none' : ''}`}>
            {syncing ? <><div className="spinner w-3 h-3 animate-spin" /> Importing...</> : <><CloudDownload size={14} /> Import CSV</>}
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={syncing} />
          </label>
          <button onClick={handleSyncGoogleForm} disabled={syncingGForm} className="btn-secondary btn-sm flex items-center gap-2 text-xs">
            {syncingGForm ? <><div className="spinner w-3 h-3" /> Syncing...</> : <><RefreshCw size={14} /> Sync GForm</>}
          </button>
          <button onClick={exportStudents} className="btn-success btn-sm flex items-center gap-2 text-xs"><Download size={14} /> Export All</button>
        </div>
      </div>

      {/* ── Import progress ── */}
      {syncing && (
        <div className="glass-card p-5 flex items-center gap-4 border-blue-500/30 bg-blue-500/5">
          <div className="spinner !w-8 !h-8 !border-t-blue-400 flex-shrink-0"></div>
          <div>
            <p className="text-slate-100 font-semibold text-sm">Importing students...</p>
            <p className="text-slate-400 text-xs mt-0.5">This may take a moment for large files. Please wait.</p>
          </div>
        </div>
      )}

      {/* ── Import report ── */}
      {!syncing && showImportReport && syncResult && (
        <div className="glass-card p-5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><CheckCircle size={18} className="text-emerald-400" /><span className="text-slate-100 font-semibold">Import Report</span></div>
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
                <Icon size={18} /><div><p className="text-lg font-bold leading-tight">{value}</p><p className="text-xs opacity-70">{label}</p></div>
              </div>
            ))}
          </div>
          {syncResult.errors?.length > 0 && (
            <div>
              <button onClick={() => setShowErrors(v => !v)} className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                <AlertTriangle size={13} />{syncResult.errors.length} warning(s){showErrors ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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

      {/* ── Tabs ── */}
      <div className="flex bg-slate-800/60 rounded-xl p-1 w-fit">
        {[{ key: 'all', label: `All (${total})` }, { key: 'active', label: `Online (${activeStudents.length})` }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Search + Filters ── */}
      {tab === 'all' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, Name, Roll No., Email, Mobile..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-10 pr-4"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={() => setShowFilters(v => !v)}
              className={`btn-secondary btn-sm flex items-center gap-2 text-xs ${activeFilterCount > 0 ? 'border-blue-500/50 text-blue-400' : ''}`}>
              <Filter size={14} />
              Filters {activeFilterCount > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>}
              {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilterDept(''); setFilterYear(''); setFilterSem(''); setFilterSection(''); setFilterStatus('') }}
                className="btn-secondary btn-sm text-xs text-red-400 border-red-500/30">
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Department</label>
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field text-sm">
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Year</label>
                <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="input-field text-sm">
                  <option value="">All Years</option>
                  {['1','2','3','4'].map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Semester</label>
                <select value={filterSem} onChange={e => setFilterSem(e.target.value)} className="input-field text-sm">
                  <option value="">All Semesters</option>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Section</label>
                <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="input-field text-sm">
                  <option value="">All Sections</option>
                  {['A','B','C','D','E'].map(s => <option key={s} value={s}>Section {s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Student Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-sm">
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bulk Action Toolbar ── */}
      {selected.size > 0 && (
        <div className="glass-card p-3 border-blue-500/30 bg-blue-500/5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm flex-shrink-0">
            <CheckCircle size={16} />
            {selected.size} selected
          </div>
          <div className="h-4 w-px bg-slate-600 flex-shrink-0" />
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setBulkAction('promoteYear')} className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <TrendingUp size={12} /> Promote Year
            </button>
            <button onClick={() => setBulkAction('department')} className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <GraduationCap size={12} /> Change Dept
            </button>
            <button onClick={() => setBulkAction('year')} className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <TrendingUp size={12} /> Change Year
            </button>
            <button onClick={() => setBulkAction('semester')} className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <TrendingUp size={12} /> Change Sem
            </button>
            <button onClick={() => setBulkAction('section')} className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <Users size={12} /> Change Section
            </button>
            <button onClick={() => setBulkAction('activate')} className="btn-secondary btn-sm text-xs text-emerald-400 border-emerald-500/30 flex items-center gap-1.5">
              <ToggleRight size={12} /> Activate
            </button>
            <button onClick={() => setBulkAction('deactivate')} className="btn-secondary btn-sm text-xs text-red-400 border-red-500/30 flex items-center gap-1.5">
              <ToggleLeft size={12} /> Deactivate
            </button>
            <button onClick={exportSelected} className="btn-secondary btn-sm text-xs text-emerald-400 border-emerald-500/30 flex items-center gap-1.5">
              <Download size={12} /> Export Selected
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="btn-icon text-slate-400 ml-auto" title="Clear selection">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {tab === 'all' && (
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-blue-500 cursor-pointer"
                    />
                  </th>
                )}
                <th>Student ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Year / Sem</th>
                <th>Section</th>
                <th>Email</th>
                <th>Status</th>
                {tab === 'active' && <th>Current Exam</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={tab === 'all' ? 10 : 9} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
              ) : displayStudents.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'all' ? 10 : 9} className="text-center py-12">
                    <Users size={40} className="mx-auto text-slate-600 mb-2" />
                    <p className="text-slate-500">No students found</p>
                    {(search || activeFilterCount > 0) && <p className="text-xs text-slate-600 mt-1">Try adjusting your search or filters</p>}
                  </td>
                </tr>
              ) : displayStudents.map(s => (
                <tr key={s._id} className={selected.has(s._id) ? 'bg-blue-500/5' : ''}>
                  {tab === 'all' && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(s._id)}
                        onChange={() => toggleOne(s._id)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-blue-500 cursor-pointer"
                      />
                    </td>
                  )}
                  <td><code className="text-blue-400 text-xs">{s.studentId}</code></td>
                  <td><span className="font-medium text-slate-200">{s.name}</span><br /><span className="text-[10px] text-slate-500">{s.rollNumber || '—'}</span></td>
                  <td className="text-slate-400 text-sm">{s.department?.code || '—'}</td>
                  <td className="text-slate-400 text-sm">Y{s.year} / S{s.semester}</td>
                  <td className="text-slate-400 text-sm">{s.section ? `Section ${s.section}` : '—'}</td>
                  <td className="text-slate-400 text-xs max-w-[140px] truncate" title={s.email}>{s.email}</td>
                  <td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`badge ${s.isActive ? 'badge-green' : 'badge-red'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                      {s.isLoggedIn && <span className="badge badge-yellow">Online</span>}
                    </div>
                  </td>
                  {tab === 'active' && <td className="text-slate-400 text-xs">{s.currentExam?.title || '—'}</td>}
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingStudent(s)} title="Edit Student" className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"><Edit3 size={14} /></button>
                      <button onClick={() => setAuditStudent(s)} title="Audit Log" className="btn-icon text-slate-400 hover:text-violet-400 hover:bg-violet-500/10"><ClipboardList size={14} /></button>
                      <button onClick={() => resetCredentials(s._id)} title="Reset Password" className="btn-icon text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10"><Key size={14} /></button>
                      <button onClick={() => toggleStatus(s._id)} title={s.isActive ? 'Deactivate' : 'Activate'} className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"><Power size={14} /></button>
                      {s.isLoggedIn && (
                        <button onClick={() => forceLogout(s._id)} title="Force Logout" className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10"><LogOut size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {tab === 'all' && total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-400">Showing {((page-1)*LIMIT)+1}–{Math.min(page*LIMIT, total)} of {total}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm text-xs disabled:opacity-40 flex items-center gap-1">
                <ChevronLeft size={12} /> Prev
              </button>
              <span className="btn-secondary btn-sm text-xs pointer-events-none">{page} / {Math.ceil(total / LIMIT)}</span>
              <button disabled={page * LIMIT >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm text-xs disabled:opacity-40 flex items-center gap-1">
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Credentials Modal ── */}
      {credModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-sm p-6 slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center border border-yellow-500/30"><Key size={20} className="text-yellow-400" /></div>
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
            <p className="text-amber-300 text-xs mt-3 p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">⚠️ Share this with the student. It won't be shown again.</p>
            <button onClick={() => setCredModal(null)} className="btn-primary w-full mt-4">Done</button>
          </div>
        </div>
      )}

      {/* ── Sync Result Modal ── */}
      {syncResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 space-y-4 slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><CloudDownload className="text-blue-400" size={20} /><h2 className="text-lg font-bold text-slate-100 font-['Outfit']">Sync Results</h2></div>
              <button onClick={() => setSyncResult(null)} className="btn-icon text-slate-400"><X size={18} /></button>
            </div>
            {syncResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Imported', val: syncResult.created || 0, color: 'text-blue-400' },
                    { label: 'Duplicates Skipped', val: syncResult.skipped || 0, color: 'text-amber-400' },
                    { label: 'Emails Sent', val: syncResult.emailsSent || 0, color: 'text-emerald-400' },
                    { label: 'Emails Failed', val: syncResult.emailsFailed || 0, color: 'text-rose-400' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{val}</p>
                      <p className="text-xs text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <AlertTriangle className="text-red-400 flex-shrink-0" size={20} />
                <div><h4 className="text-sm font-semibold text-red-400">Sync Failed</h4><p className="text-xs text-slate-400 mt-1">{syncResult.reason}</p></div>
              </div>
            )}
            <button onClick={() => setSyncResult(null)} className="btn-primary w-full">Close</button>
          </div>
        </div>
      )}

      {/* ── Edit Student Modal ── */}
      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          departments={departments}
          onClose={() => setEditingStudent(null)}
          onSaved={load}
        />
      )}

      {/* ── Audit Log Drawer ── */}
      {auditStudent && (
        <AuditLogDrawer
          student={auditStudent}
          onClose={() => setAuditStudent(null)}
        />
      )}

      {/* ── Bulk Action Modal ── */}
      {bulkAction && (
        <BulkActionModal
          action={bulkAction}
          selectedCount={selected.size}
          departments={departments}
          onConfirm={handleBulkConfirm}
          onClose={() => setBulkAction(null)}
        />
      )}
    </div>
  )
}
