import { useEffect, useState } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { Download, FileText, Trophy, TrendingUp, Users, Search } from 'lucide-react'
import { getGradeColor } from '../../utils/helpers'

export default function ResultsManager() {
  const [exams, setExams] = useState([])
  const [selectedExam, setSelectedExam] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState('')
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    api.get('/exam').then(res => setExams(res.data.exams.filter(e => e.status === 'completed' || e.totalQuestions > 0)))
    api.get('/admin/departments').then(res => setDepartments(res.data.departments || []))
  }, [])

  const loadResults = async (examId) => {
    if (!examId) return
    setLoading(true)
    try {
      const res = await api.get(`/exam/${examId}/results`)
      setResults(res.data.results)
    } finally {
      setLoading(false)
    }
  }

  const handleExamChange = (e) => {
    setSelectedExam(e.target.value)
    setSearch('')
    setFilterDept('')
    loadResults(e.target.value)
  }

  const handleForceSubmit = async (studentId) => {
    if (!confirm("Force submit this student's exam?")) return
    try {
      await api.post(`/exam/${selectedExam}/force-submit/${studentId}`)
      toast.success('Exam force submitted')
      loadResults(selectedExam)
    } catch {
      toast.error('Failed')
    }
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
      const res = await api.get(urlMap[type], { responseType: 'blob' })
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

  // Filter results
  const filtered = results.filter(r => {
    const s = search.toLowerCase()
    const matchSearch = !search ||
      r.student?.name?.toLowerCase().includes(s) ||
      r.student?.rollNumber?.toLowerCase().includes(s) ||
      r.student?.studentId?.toLowerCase().includes(s)
    const matchDept = !filterDept || r.student?.department?._id === filterDept
    return matchSearch && matchDept
  })

  const stats = results.length > 0 ? {
    total: results.length,
    passed: results.filter(r => r.isPassed).length,
    avg: (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(1),
    highest: Math.max(...results.map(r => r.obtainedMarks)),
    passRate: ((results.filter(r => r.isPassed).length / results.length) * 100).toFixed(1),
  } : null

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Results</h1>
          <p className="text-slate-400 text-sm">View, search, and export exam results</p>
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
          {exams.map(e => <option key={e._id} value={e._id}>{e.title} — {e.subject?.name}</option>)}
        </select>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Students', value: stats.total, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'Passed', value: stats.passed, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Failed', value: stats.total - stats.passed, icon: FileText, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            { label: 'Pass Rate', value: `${stats.passRate}%`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Avg Score', value: `${stats.avg}%`, icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
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

      {/* Search + Filter */}
      {results.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input-field pl-9 py-2 text-sm"
              placeholder="Search by name, roll number, student ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input-field w-auto py-2 text-sm" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          {(search || filterDept) && (
            <button onClick={() => { setSearch(''); setFilterDept('') }} className="btn-secondary btn-sm text-xs">
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Results table */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="spinner" /></div>
      ) : filtered.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <p className="text-slate-400 text-sm">
              Showing {filtered.length} of {results.length} results
              {search || filterDept ? ' (filtered)' : ''}
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
                  <th>Department</th>
                  <th>Marks</th>
                  <th>%</th>
                  <th>Grade</th>
                  <th>Correct</th>
                  <th>Wrong</th>
                  <th>Skipped</th>
                  <th>Exam Time</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const timeSpent = r.timeSpent ? `${Math.floor(r.timeSpent / 60)}m ${r.timeSpent % 60}s` : '—'
                  return (
                    <tr key={r._id}>
                      <td>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-amber-500/30 text-amber-300' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-700/30 text-orange-400' : 'bg-slate-700/50 text-slate-400'
                        }`}>{r.rank || i + 1}</div>
                      </td>
                      <td><code className="text-blue-400 text-xs">{r.student?.studentId}</code></td>
                      <td className="font-medium text-slate-200">{r.student?.name}</td>
                      <td className="text-slate-400 text-sm">{r.student?.rollNumber}</td>
                      <td className="text-slate-400 text-xs">{r.student?.department?.name || '—'}</td>
                      <td className="font-semibold">{r.obtainedMarks}/{r.totalMarks}</td>
                      <td className="font-semibold text-slate-200">{r.percentage?.toFixed(1)}%</td>
                      <td><span className={`font-bold ${getGradeColor(r.grade)}`}>{r.grade}</span></td>
                      <td className="text-emerald-400">{r.correctAnswers}</td>
                      <td className="text-red-400">{r.wrongAnswers}</td>
                      <td className="text-slate-400">{r.skippedAnswers}</td>
                      <td className="text-slate-500 text-xs">{timeSpent}</td>
                      <td><span className={`badge font-semibold ${r.isPassed ? 'badge-green' : 'badge-red'}`}>{r.isPassed ? 'PASS' : 'FAIL'}</span></td>
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
          <p className="text-slate-400">{search || filterDept ? 'No results match the search/filter' : 'No results submitted for this exam yet'}</p>
        </div>
      ) : null}
    </div>
  )
}
