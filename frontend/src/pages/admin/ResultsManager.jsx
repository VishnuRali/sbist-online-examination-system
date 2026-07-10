import { useEffect, useState } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { Download, FileText, Trophy, TrendingUp, Users, Search, Filter, X } from 'lucide-react'
import { getGradeColor } from '../../utils/helpers'

export default function ResultsManager() {
  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState('')
  const [departments, setDepartments] = useState([])

  // Advanced Filters
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterSem, setFilterSem] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterExamStatus, setFilterExamStatus] = useState('')
  const [filterResultStatus, setFilterResultStatus] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  
  const [showFilters, setShowFilters] = useState(false)

  // Fetch dropdown lists on mount
  useEffect(() => {
    api.get('/exam').then(res => setExams(res.data.exams || []))
    api.get('/admin/departments').then(res => setDepartments(res.data.departments || []))
  }, [])

  // Fetch results based on active filters
  const loadResults = async (examId) => {
    if (!examId) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await api.get(`/exam/${examId}/results`, {
        params: {
          department: filterDept,
          year: filterYear,
          semester: filterSem,
          section: filterSection,
          examStatus: filterExamStatus,
          resultStatus: filterResultStatus,
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
          search
        }
      })
      setResults(res.data.results || [])
    } catch {
      toast.error('Failed to load results')
    } finally {
      setLoading(false)
    }
  }

  // Load results when selected exam or filters change
  useEffect(() => {
    loadResults(selectedExam)
  }, [selectedExam, filterDept, filterYear, filterSem, filterSection, filterExamStatus, filterResultStatus, filterDateFrom, filterDateTo, search])

  const handleExamChange = (e) => {
    setSelectedExam(e.target.value)
  }

  const handleExport = async (type) => {
    if (!selectedExam) return
    setExporting(type)
    try {
      const urlMap = {
        excel: `/exam/${selectedExam}/results/export-excel`,
        csv:   `/exam/${selectedExam}/results/export-csv`,
        pdf:   `/exam/${selectedExam}/results/export-pdf`,
      }
      const extMap = { excel: 'xlsx', csv: 'csv', pdf: 'pdf' }
      const res = await api.get(urlMap[type], {
        responseType: 'blob',
        params: {
          department: filterDept,
          year: filterYear,
          semester: filterSem,
          section: filterSection,
          examStatus: filterExamStatus,
          resultStatus: filterResultStatus,
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
          search
        }
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `results_${selectedExam}.${extMap[type]}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported as ${type.toUpperCase()}!`)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting('')
    }
  }

  const clearFilters = () => {
    setSearch('')
    setFilterDept('')
    setFilterYear('')
    setFilterSem('')
    setFilterSection('')
    setFilterExamStatus('')
    setFilterResultStatus('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  // Stats calculation for the current list of displayed students
  const activeStats = results.length > 0 ? {
    total: results.length,
    passed: results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) && r.isPassed).length,
    failed: results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) && !r.isPassed).length,
    avg: (results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status)).reduce((s, r) => s + r.percentage, 0) / Math.max(1, results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status)).length)).toFixed(1),
    passRate: ((results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) && r.isPassed).length / Math.max(1, results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status)).length)) * 100).toFixed(1),
  } : null

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return 'badge-green'
      case 'Submitted':
        return 'badge-green bg-green-500/10 text-green-400'
      case 'Auto Submitted':
        return 'badge-yellow bg-yellow-500/10 text-yellow-500'
      case 'Disqualified':
        return 'badge-red animate-pulse'
      case 'In Progress (Writing Exam)':
        return 'badge-blue'
      case 'Absent':
        return 'badge-red bg-red-950/20 text-red-400 border border-red-500/10'
      case 'Waiting':
      default:
        return 'badge-secondary'
    }
  }

  const activeFilterCount = [filterDept, filterYear, filterSem, filterSection, filterExamStatus, filterResultStatus, filterDateFrom, filterDateTo].filter(Boolean).length

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Results Manager</h1>
          <p className="text-slate-400 text-sm">View, filter, and export targeted student results and exam statuses</p>
        </div>
        {selectedExam && results.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleExport('excel')} disabled={!!exporting}
              className="btn-success btn-sm flex items-center gap-1.5 text-xs">
              {exporting === 'excel' ? <div className="spinner !w-4 !h-4 !border-t-white" /> : <Download size={13} />}
              Excel
            </button>
            <button onClick={() => handleExport('csv')} disabled={!!exporting}
              className="btn-secondary btn-sm flex items-center gap-1.5 text-xs">
              {exporting === 'csv' ? <div className="spinner !w-4 !h-4" /> : <FileText size={13} />}
              CSV
            </button>
            <button onClick={() => handleExport('pdf')} disabled={!!exporting}
              className="btn-warning btn-sm flex items-center gap-1.5 text-xs">
              {exporting === 'pdf' ? <div className="spinner !w-4 !h-4 !border-t-white" /> : <FileText size={13} />}
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Exam selector */}
      <div className="glass-card p-4">
        <label className="input-label">Select Exam</label>
        <select value={selectedExam} onChange={handleExamChange} className="input-field max-w-md">
          <option value="">Choose an exam...</option>
          {exams.map(e => <option key={e._id} value={e._id}>{e.title} — Y{e.year}/S{e.semester} ({e.subject?.name || e.examType})</option>)}
        </select>
      </div>

      {/* Stats summary boxes */}
      {activeStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Targeted', value: activeStats.total, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'Passed', value: activeStats.passed, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Failed', value: activeStats.failed, icon: FileText, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            { label: 'Pass Rate', value: `${activeStats.passRate}%`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Avg Score', value: `${activeStats.avg}%`, icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`glass-card p-4 border ${bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={color} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              <p className="text-xl font-bold text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Advanced search + Filter bar */}
      {selectedExam && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field pl-9 py-2 text-sm"
                placeholder="Search by name, roll number, student ID, mobile..."
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
              className={`btn-secondary btn-sm flex items-center gap-2 text-xs ${activeFilterCount > 0 ? 'border-blue-500/50 text-blue-400' : ''}`}>
              <Filter size={14} />
              Advanced Filters {activeFilterCount > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>}
            </button>

            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="btn-secondary btn-sm text-xs text-red-400 border-red-500/30">
                <X size={12} /> Clear Filters
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Department</label>
                <select className="input-field text-xs py-1.5" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                  <option value="">All</option>
                  {departments.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Year</label>
                <select className="input-field text-xs py-1.5" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                  <option value="">All</option>
                  {['1','2','3','4'].map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Semester</label>
                <select className="input-field text-xs py-1.5" value={filterSem} onChange={e => setFilterSem(e.target.value)}>
                  <option value="">All</option>
                  <option value="1">Sem 1</option>
                  <option value="2">Sem 2</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Section</label>
                <select className="input-field text-xs py-1.5" value={filterSection} onChange={e => setFilterSection(e.target.value)}>
                  <option value="">All</option>
                  {['A','B','C','D','E'].map(s => <option key={s} value={s}>Sec {s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Exam Status</label>
                <select className="input-field text-xs py-1.5" value={filterExamStatus} onChange={e => setFilterExamStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="Waiting">Waiting</option>
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress (Writing Exam)">In Progress</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Auto Submitted">Auto Submitted</option>
                  <option value="Completed">Completed</option>
                  <option value="Absent">Absent</option>
                  <option value="Disqualified">Disqualified</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Result</label>
                <select className="input-field text-xs py-1.5" value={filterResultStatus} onChange={e => setFilterResultStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date From</label>
                <input type="date" className="input-field text-xs py-1" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date To</label>
                <input type="date" className="input-field text-xs py-1" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results table */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
      ) : results.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between bg-slate-900/40">
            <p className="text-slate-400 text-sm">
              Showing {results.length} student results
              {activeFilterCount > 0 || search ? ' (filtered)' : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Roll No</th>
                  <th>Class / Section</th>
                  <th>Mobile</th>
                  <th>Marks</th>
                  <th>%</th>
                  <th>Grade</th>
                  <th>Violations</th>
                  <th>Time Taken</th>
                  <th>Exam Status</th>
                  <th>Submission Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const timeSpent = r.timeSpent ? `${Math.floor(r.timeSpent / 60)}m ${r.timeSpent % 60}s` : '—'
                  const displaySection = r.student?.section ? `Sec ${r.student.section}` : '—'
                  return (
                    <tr key={r._id || i}>
                      <td>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          r.rank === 1 ? 'bg-amber-500/30 text-amber-300' : r.rank === 2 ? 'bg-slate-400/20 text-slate-300' : r.rank === 3 ? 'bg-orange-700/30 text-orange-400' : 'bg-slate-700/50 text-slate-400'
                        }`}>{r.rank}</div>
                      </td>
                      <td><code className="text-blue-400 text-xs font-semibold">{r.student?.studentId}</code></td>
                      <td className="font-semibold text-slate-200">
                        {r.student?.name}
                        <br />
                        <span className="text-[10px] text-slate-500">{r.student?.email}</span>
                      </td>
                      <td className="text-slate-400 text-sm">{r.student?.rollNumber || '—'}</td>
                      <td className="text-slate-400 text-sm">
                        {r.student?.department?.code || '—'} Y{r.student?.year} / S{r.student?.semester} / {displaySection}
                      </td>
                      <td className="text-slate-400 text-xs">{r.student?.mobile || '—'}</td>
                      <td className="font-semibold">
                        {['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) ? `${r.obtainedMarks} / ${r.totalMarks}` : '—'}
                      </td>
                      <td className="font-semibold text-slate-200">
                        {['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) ? `${r.percentage?.toFixed(1)}%` : '—'}
                      </td>
                      <td>
                        <span className={`font-bold ${getGradeColor(r.grade)}`}>
                          {['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) ? r.grade : '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`font-bold ${r.violations > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                          {r.violations}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">{timeSpent}</td>
                      <td>
                        <span className={`badge font-semibold text-[11px] ${getStatusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedExam ? (
        <div className="glass-card p-12 text-center">
          <FileText size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No students matching the query filters were found.</p>
        </div>
      ) : null}
    </div>
  )
}
