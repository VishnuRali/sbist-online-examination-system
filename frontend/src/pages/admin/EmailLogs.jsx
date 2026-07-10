import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import {
  Mail, RefreshCw, CheckCircle, XCircle, Clock,
  Send, X, ChevronDown, Download, Filter, Tv
} from 'lucide-react'

const TYPE_LABELS = {
  welcome:      'Welcome',
  reminder_24h: 'Reminder 24h',
  reminder_1h:  'Reminder 1h',
  reminder_30m: 'Reminder 30min',
  custom:       'Custom',
}

const STATUS_CONFIG = {
  sent:    { icon: CheckCircle, color: 'badge-green',  label: 'Sent' },
  failed:  { icon: XCircle,    color: 'badge-red',    label: 'Failed' },
  pending: { icon: Clock,      color: 'badge-yellow', label: 'Pending' },
}

const TYPE_COLORS = {
  welcome:      'badge-blue',
  reminder_24h: 'badge-green',
  reminder_1h:  'badge-yellow',
  reminder_30m: 'badge-red',
  custom:       'badge-purple',
}

export default function EmailLogs() {
  const [logs, setLogs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [pages, setPages]             = useState(1)
  const [filterType, setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Advanced Filters
  const [filterDept, setFilterDept]   = useState('')
  const [filterYear, setFilterYear]   = useState('')
  const [filterSem, setFilterSem]     = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterExam, setFilterExam]   = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  const [subjects, setSubjects] = useState([])

  // Server stats state
  const [totalEmails, setTotalEmails] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [retriedCount, setRetriedCount] = useState(0)

  // Retry processing states
  const [retryingId, setRetryingId]   = useState(null)
  const [retryingAll, setRetryingAll] = useState(false)

  // Manual send notification modal state
  const [showSendModal, setShowSendModal] = useState(false)
  const [exams, setExams]                 = useState([])
  const [sendForm, setSendForm]           = useState({
    examId: '',
    type: 'reminder_30m',
    target: 'all',
    targetValue: '',
    departmentId: '',
    year: '',
    semester: '',
    section: '',
    studentId: ''
  })
  const [sending, setSending]             = useState(false)

  // Student search states
  const [studentSearchText, setStudentSearchText] = useState('')
  const [searchedStudents, setSearchedStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [searchingStudent, setSearchingStudent] = useState(false)

  // Recipients count states
  const [recipientsCount, setRecipientsCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(false)

  // Debounce search input for main table
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(handler)
  }, [search])

  // Debounce search input for individual student notification
  useEffect(() => {
    if (!studentSearchText.trim()) {
      setSearchedStudents([])
      return
    }
    const handler = setTimeout(async () => {
      setSearchingStudent(true)
      try {
        const res = await api.get(`/admin/students?search=${studentSearchText.trim()}&limit=10`)
        setSearchedStudents(res.data.students || [])
      } catch {}
      setSearchingStudent(false)
    }, 300)
    return () => clearTimeout(handler)
  }, [studentSearchText])

  // Fetch recipients count dynamically
  useEffect(() => {
    if (!sendForm.examId) {
      setRecipientsCount(0)
      return
    }
    const fetchCount = async () => {
      setLoadingCount(true)
      try {
        const payload = {
          target: sendForm.target,
          examId: sendForm.examId,
          departmentId: sendForm.departmentId,
          year: sendForm.year,
          semester: sendForm.semester,
          section: sendForm.section,
          targetValue: sendForm.target === 'student' ? (selectedStudent?._id || '') : ''
        }
        const res = await api.post('/admin/send-reminders/preview-count', payload)
        setRecipientsCount(res.data.count || 0)
      } catch {
        setRecipientsCount(0)
      }
      setLoadingCount(false)
    }
    fetchCount()
  }, [
    sendForm.target,
    sendForm.examId,
    sendForm.departmentId,
    sendForm.year,
    sendForm.semester,
    sendForm.section,
    selectedStudent
  ])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 30 })
      if (filterType)   params.append('type',   filterType)
      if (filterStatus) params.append('status', filterStatus)
      if (filterDept)   params.append('department', filterDept)
      if (filterYear)   params.append('year', filterYear)
      if (filterSem)    params.append('semester', filterSem)
      if (filterSection) params.append('section', filterSection)
      if (filterExam)   params.append('exam', filterExam)
      if (filterSubject) params.append('subject', filterSubject)
      if (filterDateFrom) params.append('dateFrom', filterDateFrom)
      if (filterDateTo)   params.append('dateTo', filterDateTo)
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
      const res = await api.get(`/admin/email-logs?${params}`)
      setLogs(res.data.logs   || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 1)
      setTotalEmails(res.data.totalEmails || 0)
      setSentCount(res.data.sentCount || 0)
      setFailedCount(res.data.failedCount || 0)
      setPendingCount(res.data.pendingCount || 0)
      setRetriedCount(res.data.retriedCount || 0)
    } catch {
      toast.error('Failed to load email logs')
    } finally {
      setLoading(false)
    }
  }, [page, filterType, filterStatus, filterDept, filterYear, filterSem, filterSection, filterExam, filterSubject, filterDateFrom, filterDateTo, debouncedSearch])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const [departments, setDepartments] = useState([])

  const fetchExams = async () => {
    try {
      const res = await api.get('/exam')
      setExams(res.data.exams || [])
    } catch {}
  }

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/admin/departments')
      setDepartments(res.data.departments || [])
    } catch {}
  }

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/admin/subjects')
      setSubjects(res.data.subjects || [])
    } catch {}
  }

  useEffect(() => {
    fetchExams()
    fetchDepartments()
    fetchSubjects()
  }, [])

  const openSendModal = () => {
    fetchExams()
    fetchDepartments()
    setSelectedStudent(null)
    setStudentSearchText('')
    setSearchedStudents([])
    setSendForm({
      examId: '',
      type: 'reminder_30m',
      target: 'all',
      targetValue: '',
      departmentId: '',
      year: '',
      semester: '',
      section: '',
      studentId: ''
    })
    setShowSendModal(true)
  }

  const handleExamChange = (examId) => {
    const selectedExam = exams.find(e => e._id === examId)
    setSendForm(f => ({
      ...f,
      examId,
      departmentId: selectedExam?.department?._id || selectedExam?.department || '',
      year: selectedExam?.year || '',
      semester: selectedExam?.semester || '',
      section: selectedExam?.section || '',
    }))
  }

  const handleSendReminder = async (e) => {
    e.preventDefault()
    if (!sendForm.examId) { toast.error('Please select an exam', { id: 'sr-err' }); return }
    setSending(true)
    try {
      const payload = { ...sendForm }
      if (sendForm.target === 'student') {
        payload.targetValue = sendForm.studentId || sendForm.targetValue
      }
      const res = await api.post('/admin/send-reminders', payload)
      toast.success(`Sent ${res.data.sent}/${res.data.total} emails (${res.data.skipped} skipped)`, { id: 'sr-ok' })
      setShowSendModal(false)
      fetchLogs()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send', { id: 'sr-err' })
    } finally {
      setSending(false)
    }
  }

  const handleRetrySingle = async (logId) => {
    setRetryingId(logId)
    try {
      await api.post(`/admin/email-logs/${logId}/retry`)
      toast.success('Email resent successfully!')
      fetchLogs()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to retry email')
    } finally {
      setRetryingId(null)
    }
  }

  const handleRetryAll = async () => {
    if (!confirm(`Are you sure you want to retry all ${failedCount} failed emails?`)) return
    setRetryingAll(true)
    try {
      const res = await api.post('/admin/email-logs/retry-all')
      toast.success(res.data.message || 'Bulk retry complete!')
      fetchLogs()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to retry all')
    } finally {
      setRetryingAll(false)
    }
  }

  const handleExportFailed = async () => {
    try {
      const res = await api.get('/admin/email-logs/export-failed', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `failed_email_logs_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Failed email logs exported!')
    } catch {
      toast.error('Failed to export logs')
    }
  }

  // Stats mapped to backend counts
  const stats = [
    { label: 'Total Emails', value: totalEmails,   color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
    { label: 'Sent',         value: sentCount,     color: 'text-green-400',  bg: 'bg-green-500/10'  },
    { label: 'Failed',       value: failedCount,    color: 'text-red-400',    bg: 'bg-red-500/10'    },
    { label: 'Pending',      value: pendingCount,   color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Retried',      value: retriedCount,   color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ]

  const filtered = logs

  const TARGET_OPTIONS = [
    { value: 'all',     label: 'All Students (exam scope)' },
    { value: 'filter',  label: 'Filtered Group (custom filters)' },
    { value: 'student', label: 'Individual Student (Student ID)' },
  ]

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Email Logs</h1>
          <p className="text-slate-400 text-sm mt-1">Track all automated emails sent by the system</p>
        </div>
        <div className="flex gap-2">
          {failedCount > 0 && (
            <>
              <button
                onClick={handleExportFailed}
                className="btn-secondary btn-sm flex items-center gap-1.5 text-xs font-semibold"
                title="Export failed email deliveries to Excel"
              >
                <Download size={14} /> Export Failed ({failedCount})
              </button>
              <button
                onClick={handleRetryAll}
                disabled={retryingAll}
                className="btn-warning btn-sm flex items-center gap-1.5 text-xs font-semibold"
              >
                {retryingAll ? (
                  <><div className="spinner !w-3.5 !h-3.5 !border-t-black" /> Retrying...</>
                ) : (
                  <><RefreshCw size={14} /> Retry Failed Emails</>
                )}
              </button>
            </>
          )}
          <button onClick={openSendModal} className="btn-primary btn-sm flex gap-2">
            <Send size={14} /> Send Notification
          </button>
          <button onClick={fetchLogs} className="btn-secondary btn-sm flex gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`glass-card p-4 ${s.bg} border-0`}>
            <p className="text-slate-400 text-xs">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input-field pl-9 py-2"
              placeholder="Search by email, name, Student ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`btn-secondary btn-sm flex items-center gap-2 text-xs ${
              [filterDept, filterYear, filterSem, filterSection, filterExam, filterSubject, filterDateFrom, filterDateTo, filterType, filterStatus].filter(Boolean).length > 0 ? 'border-blue-500/50 text-blue-400' : ''
            }`}>
            <Filter size={14} />
            Filters {[filterDept, filterYear, filterSem, filterSection, filterExam, filterSubject, filterDateFrom, filterDateTo, filterType, filterStatus].filter(Boolean).length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {[filterDept, filterYear, filterSem, filterSection, filterExam, filterSubject, filterDateFrom, filterDateTo, filterType, filterStatus].filter(Boolean).length}
              </span>
            )}
          </button>
          {[filterDept, filterYear, filterSem, filterSection, filterExam, filterSubject, filterDateFrom, filterDateTo, filterType, filterStatus, search].some(Boolean) && (
            <button onClick={() => {
              setSearch(''); setFilterType(''); setFilterStatus(''); setFilterDept(''); setFilterYear(''); setFilterSem(''); setFilterSection(''); setFilterExam(''); setFilterSubject(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1);
            }} className="btn-secondary btn-sm text-xs text-red-400 border-red-500/30">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Email Type</label>
              <select className="input-field text-xs py-1.5" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Status</label>
              <select className="input-field text-xs py-1.5" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
                <option value="">All</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Department</label>
              <select className="input-field text-xs py-1.5" value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {departments.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Year</label>
              <select className="input-field text-xs py-1.5" value={filterYear} onChange={e => { setFilterYear(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {['1','2','3','4'].map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Semester</label>
              <select className="input-field text-xs py-1.5" value={filterSem} onChange={e => { setFilterSem(e.target.value); setPage(1) }}>
                <option value="">All</option>
                <option value="1">Sem 1</option>
                <option value="2">Sem 2</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Section</label>
              <select className="input-field text-xs py-1.5" value={filterSection} onChange={e => { setFilterSection(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {['A','B','C','D','E'].map(s => <option key={s} value={s}>Sec {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Exam</label>
              <select className="input-field text-xs py-1.5" value={filterExam} onChange={e => { setFilterExam(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {exams.map(e => <option key={e._id} value={e._id}>{e.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Subject</label>
              <select className="input-field text-xs py-1.5" value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(1) }}>
                <option value="">All</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date From</label>
              <input type="date" className="input-field text-xs py-1" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1) }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date To</label>
              <input type="date" className="input-field text-xs py-1" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1) }} />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Student ID</th>
                <th>Department</th>
                <th>Class Details</th>
                <th>Type</th>
                <th>Status</th>
                <th>Exam</th>
                <th>Attempted At</th>
                <th>Error</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <div className="spinner mx-auto mb-2" />
                  <p className="text-slate-500">Loading logs...</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <Mail size={36} className="mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-500">No email logs found</p>
                </td></tr>
              ) : filtered.map(log => {
                const s = STATUS_CONFIG[log.status] || STATUS_CONFIG.pending
                const StatusIcon = s.icon
                return (
                  <tr key={log._id}>
                    <td>
                      <p className="font-medium text-slate-200 text-sm">{log.studentName || '—'}</p>
                      <p className="text-slate-500 text-xs">{log.to}</p>
                    </td>
                    <td className="font-mono text-xs text-slate-400">{log.studentId || '—'}</td>
                    <td>
                      <span className="text-slate-300 text-xs font-semibold">
                        {log.department?.name || log.student?.department?.name || '—'}
                      </span>
                      {log.department?.code && (
                        <p className="text-[10px] text-slate-500 font-bold uppercase">{log.department.code}</p>
                      )}
                    </td>
                    <td className="text-xs text-slate-400 font-medium">
                      {log.year ? `Year ${log.year}` : '—'} &nbsp;•&nbsp; {log.semester ? `Sem ${log.semester}` : '—'}
                      {log.section ? ` &nbsp;•&nbsp; Sec ${log.section}` : ''}
                    </td>
                    <td>
                      <span className={`badge ${TYPE_COLORS[log.type] || 'badge-gray'}`}>
                        {TYPE_LABELS[log.type] || log.type}
                      </span>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <span className={`badge ${s.color} flex items-center gap-1 w-fit`}>
                          <StatusIcon size={11} />
                          {s.label}
                        </span>
                        {log.attempts > 1 && (
                          <p className="text-[10px] text-slate-500 font-medium">
                            Attempts: {log.attempts}/4
                          </p>
                        )}
                        {log.status === 'failed' && log.nextAttemptAt && (
                          <p className="text-[10px] text-amber-500 font-medium whitespace-nowrap" title={new Date(log.nextAttemptAt).toLocaleString()}>
                            Retry: {new Date(log.nextAttemptAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="text-slate-400 text-xs">{log.exam?.title || '—'}</td>
                    <td className="text-slate-500 text-xs">
                      {new Date(log.attemptedAt || log.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td>
                      {log.errorMessage ? (
                        <span className="text-red-400 text-xs" title={log.errorMessage}>
                          {log.errorMessage.length > 40 ? log.errorMessage.slice(0, 40) + '…' : log.errorMessage}
                        </span>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td>
                      {log.status === 'failed' && (
                        <button
                          onClick={() => handleRetrySingle(log._id)}
                          disabled={retryingId === log._id}
                          className="btn-primary py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 font-medium transition-all"
                          title="Retry sending this email now"
                        >
                          {retryingId === log._id ? (
                            <div className="spinner !w-3 !h-3 !border-t-white" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-slate-500 text-sm">Page {page} of {pages} ({total} total)</p>
            <div className="flex gap-2">
              <button disabled={page === 1}     onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm">← Prev</button>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Send Notification Modal ─────────────────────────── */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md slide-up">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                  <Send size={18} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">Send Notification</h2>
                  <p className="text-xs text-slate-400">Send exam reminder emails to students</p>
                </div>
              </div>
              <button onClick={() => setShowSendModal(false)} className="btn-icon text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendReminder} className="p-5 space-y-4">
              {/* Exam selector */}
              <div>
                <label className="input-label">Exam *</label>
                <div className="relative">
                  <select
                    value={sendForm.examId}
                    onChange={e => handleExamChange(e.target.value)}
                    className="input-field pr-8 appearance-none"
                    required
                  >
                    <option value="">Select Exam...</option>
                    {exams.map(ex => (
                      <option key={ex._id} value={ex._id}>
                        {ex.title} — {ex.subject?.name || ''} ({ex.status})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="input-label">Reminder Type *</label>
                <div className="relative">
                  <select
                    value={sendForm.type}
                    onChange={e => setSendForm(f => ({ ...f, type: e.target.value }))}
                    className="input-field pr-8 appearance-none"
                    required
                  >
                    <option value="reminder_30m">30 Minutes Reminder</option>
                    <option value="reminder_1h">1 Hour Reminder</option>
                    <option value="reminder_24h">24 Hours Reminder</option>
                    <option value="custom">Custom Notification</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Target audience */}
              <div>
                <label className="input-label">Target Audience</label>
                <div className="relative">
                  <select
                    value={sendForm.target}
                    onChange={e => setSendForm(f => ({ ...f, target: e.target.value, targetValue: '' }))}
                    className="input-field pr-8 appearance-none"
                  >
                    {TARGET_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Filter configurations (conditional) */}
              {sendForm.target === 'filter' && (
                <div className="space-y-3 bg-slate-800/40 p-3 border border-slate-700/50 rounded-xl">
                  {/* Department */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Department</label>
                    <div className="relative">
                      <select
                        value={sendForm.departmentId}
                        onChange={e => setSendForm(f => ({ ...f, departmentId: e.target.value }))}
                        className="input-field py-1.5 px-3 pr-8 text-xs appearance-none"
                      >
                        <option value="">All Departments</option>
                        {departments.map(d => (
                          <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {/* Year */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Year</label>
                      <div className="relative">
                        <select
                          value={sendForm.year}
                          onChange={e => setSendForm(f => ({ ...f, year: e.target.value }))}
                          className="input-field py-1.5 px-3 pr-8 text-xs appearance-none"
                        >
                          <option value="">All Years</option>
                          <option value="1">1st Year</option>
                          <option value="2">2nd Year</option>
                          <option value="3">3rd Year</option>
                          <option value="4">4th Year</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Semester */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Sem</label>
                      <div className="relative">
                        <select
                          value={sendForm.semester}
                          onChange={e => setSendForm(f => ({ ...f, semester: e.target.value }))}
                          className="input-field py-1.5 px-3 pr-8 text-xs appearance-none"
                        >
                          <option value="">All Semesters</option>
                          <option value="1">Semester 1</option>
                          <option value="2">Semester 2</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Section */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Section</label>
                      <div className="relative">
                        <select
                          value={sendForm.section}
                          onChange={e => setSendForm(f => ({ ...f, section: e.target.value }))}
                          className="input-field py-1.5 px-3 pr-8 text-xs appearance-none"
                        >
                          <option value="">All Sections</option>
                          <option value="A">Section A</option>
                          <option value="B">Section B</option>
                          <option value="C">Section C</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Student Search for Individual Student (conditional) */}
              {sendForm.target === 'student' && (
                <div className="space-y-2">
                  <label className="input-label">Individual Student *</label>
                  {selectedStudent ? (
                    <div className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-slate-200">{selectedStudent.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {selectedStudent.studentId} • Roll: {selectedStudent.rollNumber || 'N/A'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudent(null)
                          setStudentSearchText('')
                          setSendForm(f => ({ ...f, targetValue: '' }))
                        }}
                        className="text-xs text-red-400 hover:text-red-300 font-semibold"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={studentSearchText}
                        onChange={e => setStudentSearchText(e.target.value)}
                        className="input-field"
                        placeholder="Search by Name, Student ID, Roll Number..."
                        required={!selectedStudent}
                      />
                      {searchingStudent && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 spinner !w-3.5 !h-3.5 !border-t-blue-400" />
                      )}
                      {searchedStudents.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50 py-1">
                          {searchedStudents.map(student => (
                            <button
                              key={student._id}
                              type="button"
                              onClick={() => {
                                setSelectedStudent(student)
                                setSendForm(f => ({ ...f, targetValue: student._id }))
                                setSearchedStudents([])
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-800 border-b border-slate-800/50 last:border-b-0 transition-colors block"
                            >
                              <p className="text-xs font-bold text-slate-200">{student.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {student.studentId} • Roll: {student.rollNumber || 'N/A'}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Recipients count preview */}
              {sendForm.examId && (
                <div className="p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Estimated Recipients:</span>
                  {loadingCount ? (
                    <div className="spinner !w-3.5 !h-3.5 !border-t-blue-400" />
                  ) : (
                    <span className="font-bold text-blue-400 text-sm">{recipientsCount} students</span>
                  )}
                </div>
              )}

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                ℹ️ Emails are logged in Email Logs. Already-sent logs per student are deduplicated.
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowSendModal(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={sending || (sendForm.target === 'student' && !selectedStudent)} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {sending
                    ? <><div className="spinner !w-4 !h-4 !border-t-white" /> Sending...</>
                    : <><Send size={14} /> Send Emails</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
