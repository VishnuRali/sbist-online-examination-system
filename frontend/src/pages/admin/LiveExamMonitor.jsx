import { useEffect, useState, useRef } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import {
  Users, Play, CheckCircle, AlertTriangle, ShieldAlert, Clock, UserX,
  RefreshCw, Filter, Award, Search, GraduationCap, Calendar, Building2,
  Tv, Database, BellRing
} from 'lucide-react'

export default function LiveExamMonitor() {
  const [exams, setExams] = useState([])
  const [departments, setDepartments] = useState([])

  // Filters
  const [filterExam, setFilterExam] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterSem, setFilterSem] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [search, setSearch] = useState('')

  // Real-time Data
  const [stats, setStats] = useState({
    totalStudents: 0,
    waiting: 0,
    writing: 0,
    submitted: 0,
    autoSubmitted: 0,
    absent: 0,
    disqualified: 0
  })
  const [students, setStudents] = useState([])
  const [violations, setViolations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const timerRef = useRef(null)

  // Load dropdown choices
  useEffect(() => {
    api.get('/exam').then(res => {
      // Show draft/active/scheduled exams
      setExams(Array.isArray(res.data?.exams) ? res.data.exams : [])
    }).catch(() => {
      toast.error('Failed to load exams')
      setError('Unable to load live monitoring data.')
    })

    api.get('/admin/departments').then(res => {
      setDepartments(Array.isArray(res.data?.departments) ? res.data.departments : [])
    }).catch(() => {
      toast.error('Failed to load departments')
      setError('Unable to load live monitoring data.')
    })
  }, [])

  // Load monitoring data
  const loadData = async (showLoadingIndicator = false) => {
    if (showLoadingIndicator) setLoading(true)
    setError(null)
    try {
      const res = await api.get('/admin/live-monitor', {
        params: {
          examId: filterExam,
          departmentId: filterDept,
          year: filterYear,
          semester: filterSem,
          section: filterSection
        }
      })

      const responseData = res.data || {}
      setStats(responseData.stats || {
        totalStudents: 0,
        waiting: 0,
        writing: 0,
        submitted: 0,
        autoSubmitted: 0,
        absent: 0,
        disqualified: 0
      })
      setStudents(Array.isArray(responseData.students) ? responseData.students : [])
      setViolations(Array.isArray(responseData.violations) ? responseData.violations : [])
      setLastUpdated(new Date())
    } catch (err) {
      toast.error('Failed to update live monitor data')
      setError('Unable to load live monitoring data.')
    } finally {
      if (showLoadingIndicator) setLoading(false)
    }
  }

  // Load on filter change
  useEffect(() => {
    loadData(true)
  }, [filterExam, filterDept, filterYear, filterSem, filterSection])

  // Auto refresh effect (every 5 seconds)
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        loadData(false)
      }, 5000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoRefresh, filterExam, filterDept, filterYear, filterSem, filterSection])

  // Filter students by local search name/ID
  const filteredStudents = students.filter(s => {
    if (!search) return true
    const q = search.toLowerCase().trim()
    return (
      s.name?.toLowerCase().includes(q) ||
      s.studentId?.toLowerCase().includes(q) ||
      s.rollNumber?.toLowerCase().includes(q) ||
      s.examTitle?.toLowerCase().includes(q)
    )
  })

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Currently Writing Exam':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
      case 'Submitted':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
      case 'Auto Submitted':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
      case 'Disqualified':
        return 'bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse'
      case 'Absent':
        return 'bg-slate-500/15 text-slate-400 border border-slate-700/50'
      case 'Waiting':
      default:
        return 'bg-slate-800/80 text-slate-300 border border-slate-700/50'
    }
  }

  if (error) {
    return (
      <div className="space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Live Exam Monitoring</h1>
        </div>
        <div className="glass-card p-12 text-center border-red-500/20 bg-red-500/5">
          <AlertTriangle size={40} className="text-red-400 mx-auto mb-4 animate-bounce" />
          <p className="text-red-400 text-lg font-medium">{error}</p>
          <p className="text-slate-500 text-sm mb-6">Unable to load live monitoring data.</p>
          <button onClick={() => loadData(true)} className="btn-primary btn-sm flex items-center gap-2 mx-auto">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Live Exam Monitoring</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64 bg-slate-800/20 rounded-2xl border border-slate-700/30">
          <div className="spinner mb-4"></div>
          <p className="text-slate-400 text-sm">Loading live examination data...</p>
        </div>
      </div>
    )
  }

  if (exams.length === 0) {
    return (
      <div className="space-y-6 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Live Exam Monitoring</h1>
        </div>
        <div className="glass-card p-12 text-center">
          <Tv size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg font-medium">No active examinations right now.</p>
          <p className="text-slate-500 text-sm">Create and schedule exams to monitor live student activity.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Tv className="text-blue-500 animate-pulse" size={24} />
            <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Live Exam Monitoring</h1>
          </div>
          <p className="text-slate-400 text-sm mt-0.5">Real-time supervision of active exam status and proctoring metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 rounded-xl px-3 py-1.5 border border-slate-700/50">
            <div className={`w-2.5 h-2.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-600'}`} />
            <span className="text-xs text-slate-300 font-medium">
              {autoRefresh ? 'Live Auto-Syncing (5s)' : 'Sync Paused'}
            </span>
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className="text-[10px] text-blue-400 font-bold ml-2 hover:underline hover:text-blue-300"
            >
              {autoRefresh ? 'PAUSE' : 'RESUME'}
            </button>
          </div>
          <button
            onClick={() => loadData(true)}
            className="btn-secondary btn-sm text-xs flex items-center gap-1.5"
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Force Refresh
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="glass-card p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Target Exam</label>
          <select value={filterExam} onChange={e => setFilterExam(e.target.value)} className="input-field py-2 text-xs">
            <option value="">All Active Exams</option>
            {exams.map(e => <option key={e._id} value={e._id}>{e.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Department</label>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field py-2 text-xs">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Year</label>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="input-field py-2 text-xs">
            <option value="">All Years</option>
            {['1', '2', '3', '4'].map(y => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Semester</label>
          <select value={filterSem} onChange={e => setFilterSem(e.target.value)} className="input-field py-2 text-xs">
            <option value="">All Semesters</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Section</label>
          <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="input-field py-2 text-xs">
            <option value="">All Sections</option>
            {['A', 'B', 'C'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Real-time stats card container */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        {[
          { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'text-slate-300', border: 'border-slate-700/50 bg-slate-800/40' },
          { label: 'Writing Exam', value: stats.writing, icon: Play, color: 'text-blue-400', border: 'border-blue-500/20 bg-blue-500/5 animate-pulse-slow' },
          { label: 'Waiting / Ready', value: stats.waiting, icon: Clock, color: 'text-violet-400', border: 'border-violet-500/20 bg-violet-500/5' },
          { label: 'Submitted', value: stats.submitted, icon: CheckCircle, color: 'text-emerald-400', border: 'border-emerald-500/20 bg-emerald-500/5' },
          { label: 'Auto Submitted', value: stats.autoSubmitted, icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/20 bg-amber-500/5' },
          { label: 'Absent', value: stats.absent, icon: UserX, color: 'text-slate-400', border: 'border-slate-800 bg-slate-900/40' },
          { label: 'Disqualified', value: stats.disqualified, icon: ShieldAlert, color: 'text-red-400 border-red-500/30', border: 'border-red-500/20 bg-red-500/5' }
        ].map(({ label, value, icon: Icon, color, border }) => (
          <div key={label} className={`glass-card p-3 rounded-xl border flex flex-col justify-between ${border}`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase leading-tight">{label}</span>
              <Icon size={12} className={color} />
            </div>
            <p className={`text-xl font-extrabold ${color} leading-none`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left side: Main interactive student monitor table */}
        <div className="lg:col-span-3 glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-3 bg-slate-900/40">
            <div className="relative max-w-xs flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, roll, or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs"
              />
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">
                Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
              </p>
              {lastUpdated && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Last Sync: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Roll Number</th>
                  <th>Department</th>
                  <th>Class details</th>
                  <th>Assigned Exam</th>
                  <th>Status</th>
                  <th>Violations</th>
                  <th>Active Session</th>
                </tr>
              </thead>
              <tbody>
                {loading && students.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10">
                      <div className="spinner mx-auto" />
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-500">
                      <Database size={32} className="mx-auto mb-2 opacity-30" />
                      <p>No active targeted students match these filters.</p>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td>
                        <code className="text-blue-400 text-xs font-semibold">{s.studentId}</code>
                      </td>
                      <td>
                        <span className="font-semibold text-slate-200">{s.name}</span>
                      </td>
                      <td className="text-slate-400 text-sm">
                        {s.rollNumber || '—'}
                      </td>
                      <td className="text-slate-400 text-sm">
                        {s.department}
                      </td>
                      <td className="text-slate-400 text-sm">
                        {s.classDetails}
                      </td>
                      <td className="text-slate-300 text-xs font-medium">
                        {s.examTitle}
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span className={`badge ${getStatusBadgeClass(s.status)} font-semibold text-[11px]`}>
                            {s.status}
                          </span>

                          {s.status === 'Auto Submitted' && s.autoSubmitReason && (
                            <span
                              className="text-[10px] text-amber-400 max-w-[180px]"
                              title={s.autoSubmitReason}
                            >
                              Reason: {s.autoSubmitReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`font-bold ${s.violations > 0 ? 'text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20' : 'text-slate-400'}`}>
                          {s.violations}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${s.isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          {s.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right side: AI Proctoring Violations Feed */}
        <div className="glass-card p-4 flex flex-col h-[500px] lg:h-auto border border-slate-700/50 bg-slate-900/20">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-700/50 mb-3 flex-shrink-0">
            <ShieldAlert className="text-red-400 animate-pulse" size={16} />
            <h3 className="text-xs font-bold text-slate-200 font-['Outfit'] uppercase tracking-wider">AI Violations Feed</h3>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[600px] custom-scrollbar">
            {violations.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
                No AI violations reported yet.
              </div>
            ) : (
              violations.map((v, idx) => (
                <div key={v._id || idx} className="p-3 bg-slate-800/30 border border-slate-700/40 rounded-xl flex items-start justify-between gap-2.5 hover:border-slate-600/50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-200 text-xs truncate" title={v.studentName}>{v.studentName}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate" title={v.examTitle}>{v.studentId} · {v.examTitle}</p>
                  </div>
                  <div className="text-right flex flex-col items-end flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                      v.type === 'Auto Submitted'
                        ? 'bg-red-500/10 text-red-400 border-red-500/25'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                    }`}>
                      {v.type}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-1.5 font-mono">
                      {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
