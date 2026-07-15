import { useEffect, useState, useCallback } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import {
  TrendingUp, Users, Award, Target, CheckCircle, XCircle, BarChart2,
  PieChart, Calendar, RefreshCw, Download, Search, ChevronUp, ChevronDown,
  X, HelpCircle, Activity, GraduationCap, ClipboardList
} from 'lucide-react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement, PointElement, LineElement, Filler
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
  ArcElement, PointElement, LineElement, Filler
)

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: 'rgba(71,85,105,0.5)',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
    },
  },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(71,85,105,0.1)' } },
    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(71,85,105,0.1)' } },
  },
}

export default function StudentPerformance() {
  const [exams, setExams] = useState([])
  const [departments, setDepartments] = useState([])
  const [subjects, setSubjects] = useState([])

  const [filters, setFilters] = useState({
    examId: '',
    departmentId: '',
    year: '',
    semester: '',
    section: '',
    subjectId: '',
    search: ''
  })

  const [activeFilters, setActiveFilters] = useState({
    examId: '',
    departmentId: '',
    year: '',
    semester: '',
    section: '',
    subjectId: '',
    search: ''
  })

  const [summary, setSummary] = useState(null)
  const [charts, setCharts] = useState(null)
  const [results, setResults] = useState([])
  const [totalResults, setTotalResults] = useState(0)

  const [loading, setLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [sortBy, setSortBy] = useState('obtainedMarks')
  const [sortOrder, setSortOrder] = useState('desc')

  // Detailed Modal State
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [studentDetails, setStudentDetails] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Fetch initial dropdown items
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const [examsRes, deptsRes, subsRes] = await Promise.all([
          api.get('/exam'),
          api.get('/admin/departments'),
          api.get('/admin/subjects')
        ])
        // Filter out draft exams, completed/active/scheduled only
        setExams((examsRes.data.exams || []).filter(e => e.status !== 'draft'))
        setDepartments(deptsRes.data.departments || [])
        setSubjects(subsRes.data.subjects || [])
      } catch (err) {
        toast.error('Failed to load filter parameters')
      }
    }
    loadDropdownData()
  }, [])

  // Load summary stats and charts
  const loadSummaryData = useCallback(async (params) => {
    setLoading(true)
    try {
      const res = await api.get('/admin/student-performance/summary', { params })
      setSummary(res.data.summary)
      setCharts(res.data.charts)
    } catch (err) {
      toast.error('Failed to load performance summary')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load results table
  const loadTableData = useCallback(async (params, pNum = 1, sBy = 'obtainedMarks', sOrder = 'desc') => {
    setTableLoading(true)
    try {
      const res = await api.get('/admin/student-performance/table', {
        params: { ...params, page: pNum, limit: 20, sortBy: sBy, sortOrder: sOrder }
      })
      setResults(res.data.results || [])
      setTotalResults(res.data.total || 0)
      setPages(res.data.pages || 1)
    } catch (err) {
      toast.error('Failed to load student table data')
    } finally {
      setTableLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadSummaryData(activeFilters)
    loadTableData(activeFilters, page, sortBy, sortOrder)
  }, [activeFilters, page, sortBy, sortOrder, loadSummaryData, loadTableData])

  const handleApplyFilters = () => {
    setPage(1)
    setActiveFilters(filters)
  }

  const handleResetFilters = () => {
    const reset = {
      examId: '',
      departmentId: '',
      year: '',
      semester: '',
      section: '',
      subjectId: '',
      search: ''
    }
    setFilters(reset)
    setPage(1)
    setActiveFilters(reset)
  }

  const handleSort = (field) => {
    const order = sortBy === field && sortOrder === 'desc' ? 'asc' : 'desc'
    setSortBy(field)
    setSortOrder(order)
  }

  const handleExport = async () => {
    try {
      toast.loading('Generating Excel export...', { id: 'export' })
      const res = await api.get('/admin/student-performance/export', {
        params: activeFilters,
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `student_performance_report_${Date.now()}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      toast.success('Spreadsheet exported successfully!', { id: 'export' })
    } catch (err) {
      toast.error('Failed to export data', { id: 'export' })
    }
  }

  const handleOpenStudentDetail = async (studentId) => {
    setSelectedStudentId(studentId)
    setDetailLoading(true)
    setStudentDetails(null)
    try {
      const res = await api.get(`/admin/student-performance/student/${studentId}`)
      setStudentDetails(res.data)
    } catch (err) {
      toast.error('Failed to fetch student metrics')
      setSelectedStudentId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // Pre-calculate chart configs
  const getMarksDistChartData = () => {
    if (!charts || !charts.marksDistribution) return null
    const bins = ['0-39% (F)', '40-49% (C)', '50-59% (B)', '60-69% (B+)', '70-79% (A)', '80-89% (A+)', '90-100% (O)']
    const counts = Array(7).fill(0)

    charts.marksDistribution.forEach(b => {
      let idx = -1
      if (b._id === 0) idx = 0
      else if (b._id === 40) idx = 1
      else if (b._id === 50) idx = 2
      else if (b._id === 60) idx = 3
      else if (b._id === 70) idx = 4
      else if (b._id === 80) idx = 5
      else if (b._id === 90) idx = 6

      if (idx !== -1) counts[idx] = b.count
    })

    return {
      labels: bins,
      datasets: [{
        label: 'Number of Students',
        data: counts,
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 8
      }]
    }
  }

  const getPassFailChartData = () => {
    if (!charts || !charts.passFailDistribution) return null
    let passed = 0
    let failed = 0
    charts.passFailDistribution.forEach(d => {
      if (d._id === true) passed = d.count
      if (d._id === false) failed = d.count
    })

    return {
      labels: ['Passed', 'Failed'],
      datasets: [{
        data: [passed, failed],
        backgroundColor: ['rgba(16, 185, 129, 0.4)', 'rgba(239, 68, 68, 0.4)'],
        borderColor: ['#10b981', '#ef4444'],
        borderWidth: 1.5
      }]
    }
  }

  const getTrendChartData = () => {
    if (!charts || !charts.trends || charts.trends.length === 0) return null
    const labels = charts.trends.map(t => t._id.title || 'Exam')
    const percentages = charts.trends.map(t => t.avgPercentage)

    return {
      labels,
      datasets: [
        {
          label: 'Average Score (%)',
          data: percentages,
          borderColor: '#818cf8',
          backgroundColor: 'rgba(129, 140, 248, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#818cf8',
          fill: true,
          tension: 0.3
        }
      ]
    }
  }

  const getStudentHistoryChartData = () => {
    if (!studentDetails || !studentDetails.results || studentDetails.results.length === 0) return null
    const labels = studentDetails.results.map(r => r.exam?.title || 'Exam')
    const scores = studentDetails.results.map(r => r.percentage)

    return {
      labels,
      datasets: [
        {
          label: 'Percentage Obtained',
          data: scores,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#10b981',
          fill: true,
          tension: 0.2
        }
      ]
    }
  }

  const marksDistData = getMarksDistChartData()
  const passFailData = getPassFailChartData()
  const trendData = getTrendChartData()
  const studentHistoryData = getStudentHistoryChartData()

  // Trend Badge styling helper
  const getTrendBadge = (trend) => {
    const styles = {
      'Improving': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
      'Stable': 'bg-blue-500/10 text-blue-400 border border-blue-500/25',
      'Declining': 'bg-red-500/10 text-red-400 border border-red-500/25',
      'Insufficient Data': 'bg-slate-500/10 text-slate-400 border border-slate-500/25'
    }
    return <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${styles[trend] || styles['Insufficient Data']}`}>{trend}</span>
  }

  return (
    <div className="space-y-6 fade-in pb-12">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit'] flex items-center gap-2">
            <TrendingUp className="text-blue-500" /> Student Performance Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Monitor and analyze class pass ratios, marks distribution, and individual student progress
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={results.length === 0}
          className="btn-primary btn-sm flex items-center gap-2 text-xs"
        >
          <Download size={14} /> Export Report
        </button>
      </div>

      {/* ── 1. Filter Section ── */}
      <div className="glass-card p-5 border border-slate-700/50 space-y-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filter Analysis Dashboard</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Exam filter */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Exam</label>
            <select
              value={filters.examId}
              onChange={e => setFilters(p => ({ ...p, examId: e.target.value }))}
              className="input-field text-xs h-9 py-1 px-2.5"
            >
              <option value="">All Exams</option>
              {exams.map(e => <option key={e._id} value={e._id}>{e.title}</option>)}
            </select>
          </div>

          {/* Department filter */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Department</label>
            <select
              value={filters.departmentId}
              onChange={e => setFilters(p => ({ ...p, departmentId: e.target.value }))}
              className="input-field text-xs h-9 py-1 px-2.5"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
            </select>
          </div>

          {/* Year filter */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Year</label>
            <select
              value={filters.year}
              onChange={e => setFilters(p => ({ ...p, year: e.target.value }))}
              className="input-field text-xs h-9 py-1 px-2.5"
            >
              <option value="">All Years</option>
              {['1', '2', '3', '4'].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>

          {/* Semester filter */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Semester</label>
            <select
              value={filters.semester}
              onChange={e => setFilters(p => ({ ...p, semester: e.target.value }))}
              className="input-field text-xs h-9 py-1 px-2.5"
            >
              <option value="">All Semesters</option>
              {['1', '2'].map(s => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>

          {/* Section filter */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Section</label>
            <select
              value={filters.section}
              onChange={e => setFilters(p => ({ ...p, section: e.target.value }))}
              className="input-field text-xs h-9 py-1 px-2.5"
            >
              <option value="">All Sections</option>
              {['A', 'B', 'C', 'D', 'E'].map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
          </div>

          {/* Subject filter */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Subject</label>
            <select
              value={filters.subjectId}
              onChange={e => setFilters(p => ({ ...p, subjectId: e.target.value }))}
              className="input-field text-xs h-9 py-1 px-2.5"
            >
              <option value="">All Subjects</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
            </select>
          </div>

          {/* Search bar */}
          <div className="flex flex-col">
            <label className="text-[11px] font-medium text-slate-400 mb-1">Student Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="ID, Name, Roll..."
                value={filters.search}
                onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                className="input-field text-xs h-9 pl-8 pr-3"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button onClick={handleResetFilters} className="btn-secondary text-xs px-4 h-9 flex items-center gap-1.5">
            <RefreshCw size={13} /> Reset Filters
          </button>
          <button onClick={handleApplyFilters} className="btn-primary text-xs px-5 h-9">
            Apply Filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="spinner mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Aggregating database statistics...</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── 2. Performance Summary Cards ── */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { title: 'Total Assigned', value: summary.totalAssigned, sub: 'Eligible students', icon: Users, color: 'text-indigo-400 bg-indigo-500/10' },
                { title: 'Attended / Submitted', value: `${summary.totalAttended} / ${summary.totalSubmitted}`, sub: `${summary.totalAttended > 0 ? ((summary.totalSubmitted / summary.totalAttended) * 100).toFixed(0) : 0}% Submission rate`, icon: Target, color: 'text-blue-400 bg-blue-500/10' },
                { title: 'Passed Students', value: summary.totalPassed, sub: `Pass rate: ${summary.passPercentage.toFixed(1)}%`, icon: CheckCircle, color: 'text-emerald-400 bg-emerald-500/10' },
                { title: 'Failed Students', value: summary.totalFailed, sub: `Fail rate: ${(100 - summary.passPercentage).toFixed(1)}%`, icon: XCircle, color: 'text-red-400 bg-red-500/10' },
                { title: 'Marks (Avg / Max / Min)', value: `${summary.avgMarks.toFixed(1)}%`, sub: `High: ${summary.maxMarks.toFixed(0)} | Low: ${summary.minMarks.toFixed(0)}`, icon: Award, color: 'text-amber-400 bg-amber-500/10' },
              ].map(({ title, value, sub, icon: Icon, color }, idx) => (
                <div key={idx} className="glass-card p-4 border border-slate-700/40 relative overflow-hidden flex flex-col justify-between min-h-[105px]">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
                      <h4 className="text-lg font-bold text-slate-100 mt-1 font-mono">{value}</h4>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                      <Icon size={16} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 truncate font-medium">{sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── 3. Performance Charts ── */}
          {charts && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Marks Distribution */}
              <div className="glass-card p-5 border border-slate-700/50 flex flex-col h-[280px]">
                <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5"><BarChart2 size={14} className="text-blue-400" /> Marks Distribution</h3>
                <div className="flex-1 relative">
                  {marksDistData && summary?.totalSubmitted > 0 ? (
                    <Bar data={marksDistData} options={chartDefaults} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">No result data available</div>
                  )}
                </div>
              </div>

              {/* Pass/Fail Distribution */}
              <div className="glass-card p-5 border border-slate-700/50 flex flex-col h-[280px]">
                <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5"><PieChart size={14} className="text-emerald-400" /> Pass / Fail Ratio</h3>
                <div className="flex-1 relative">
                  {passFailData && summary?.totalSubmitted > 0 ? (
                    <Doughnut data={passFailData} options={{ ...chartDefaults, scales: undefined, cutout: '70%' }} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">No result data available</div>
                  )}
                </div>
              </div>

              {/* Average Marks Trend */}
              <div className="glass-card p-5 border border-slate-700/50 flex flex-col h-[280px]">
                <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5"><Activity size={14} className="text-indigo-400" /> Class Trend Across Exams</h3>
                <div className="flex-1 relative">
                  {trendData && charts.trends?.length > 1 ? (
                    <Line data={trendData} options={chartDefaults} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">
                      {charts.trends?.length === 1 ? 'Stable (only 1 exam conducted)' : 'Conduct 2+ exams to view trend charts'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 4. Student Performance Table ── */}
      <div className="glass-card border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
            <ClipboardList size={16} className="text-blue-500" /> Individual Student Performance Directory
          </h3>
          <span className="text-xs text-slate-500">{totalResults} result record(s) matching filters</span>
        </div>

        <div className="overflow-x-auto">
          {tableLoading ? (
            <div className="flex items-center justify-center py-20 bg-slate-900/20">
              <div className="text-center">
                <div className="spinner !w-6 !h-6 mx-auto mb-2" />
                <p className="text-slate-400 text-xs">Fetching directory logs...</p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-20 text-slate-500 text-xs">
              No performance records match your search or filter configuration.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400">
                  <th className="py-3 px-4 font-semibold w-12 text-center">S.No</th>
                  <th onClick={() => handleSort('studentId')} className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200">
                    Student ID {sortBy === 'studentId' && (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />)}
                  </th>
                  <th onClick={() => handleSort('rollNumber')} className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200">
                    Roll Number {sortBy === 'rollNumber' && (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />)}
                  </th>
                  <th onClick={() => handleSort('studentName')} className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200">
                    Student Name {sortBy === 'studentName' && (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />)}
                  </th>
                  <th className="py-3 px-4 font-semibold">Class Parameters</th>
                  <th onClick={() => handleSort('examName')} className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200">
                    Exam Title {sortBy === 'examName' && (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />)}
                  </th>
                  <th onClick={() => handleSort('obtainedMarks')} className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 text-center">
                    Marks {sortBy === 'obtainedMarks' && (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />)}
                  </th>
                  <th onClick={() => handleSort('percentage')} className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-200 text-center">
                    Percentage {sortBy === 'percentage' && (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />)}
                  </th>
                  <th className="py-3 px-4 font-semibold text-center w-12">Grade</th>
                  <th className="py-3 px-4 font-semibold text-center w-16">Status</th>
                  <th className="py-3 px-4 font-semibold text-center w-12">Rank</th>
                  <th className="py-3 px-4 font-semibold text-center">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {results.map((r, idx) => {
                  const sNo = (page - 1) * 20 + idx + 1
                  return (
                    <tr
                      key={r._id}
                      onClick={() => handleOpenStudentDetail(r.student?._id)}
                      className="hover:bg-slate-800/20 cursor-pointer text-slate-300 transition-colors"
                    >
                      <td className="py-3 px-4 text-slate-500 font-mono text-center">{sNo}</td>
                      <td className="py-3 px-4 font-mono font-semibold text-blue-400">{r.student?.studentId || '—'}</td>
                      <td className="py-3 px-4 font-mono">{r.student?.rollNumber || '—'}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{r.student?.name || '—'}</td>
                      <td className="py-3 px-4 text-slate-400">
                        {r.student?.department?.code || '—'} · Y{r.student?.year || '—'} · S{r.student?.semester || '—'} · Sec {r.student?.section || '—'}
                      </td>
                      <td className="py-3 px-4 truncate max-w-[150px] font-medium" title={r.exam?.title}>{r.exam?.title || '—'}</td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        {r.obtainedMarks} / {r.totalMarks}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-indigo-400">
                        {r.percentage.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-100 font-mono">{r.grade || '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${r.isPassed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/25'}`}>
                          {r.isPassed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-amber-400 font-mono">{r.rank || '—'}</td>
                      <td className="py-3 px-4 text-center">{getTrendBadge(r.trend)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination controls */}
        {pages > 1 && !tableLoading && (
          <div className="px-5 py-4 border-t border-slate-800 flex justify-between items-center bg-slate-900/20">
            <span className="text-slate-500 text-xs">Page {page} of {pages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(p + 1, pages))}
                disabled={page === pages}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. Individual Student Performance Modal/Drawer ── */}
      {selectedStudentId && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-end z-50 transition-all duration-300">
          <div className="w-full max-w-xl h-screen bg-slate-900 border-l border-slate-850 flex flex-col p-6 shadow-2xl overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2">
                <GraduationCap className="text-blue-500" size={24} />
                <div>
                  <h2 className="text-base font-bold text-slate-100">Student Analytics Portfolio</h2>
                  <p className="text-xs text-slate-500">Historical performance metrics</p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedStudentId(null); setStudentDetails(null) }}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="spinner mx-auto mb-2" />
                  <p className="text-slate-500 text-xs">Loading performance logs...</p>
                </div>
              </div>
            ) : studentDetails ? (
              <div className="space-y-6 flex-1 flex flex-col">
                {/* Profile Meta */}
                <div className="glass-card p-4 border border-slate-700/30 flex gap-4 items-center bg-slate-950/20">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-lg text-white">
                    {studentDetails.student?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">{studentDetails.student?.name}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {studentDetails.student?.studentId} | Roll: {studentDetails.student?.rollNumber}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {studentDetails.student?.department?.name} · Year {studentDetails.student?.year} · Semester {studentDetails.student?.semester} · Sec {studentDetails.student?.section}
                    </p>
                  </div>
                </div>

                {/* Score Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-card p-3 border border-slate-800 bg-slate-900/40 text-center">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Average Score</p>
                    <h4 className="text-base font-bold text-indigo-400 mt-1 font-mono">{studentDetails.summary.avgScore.toFixed(1)}%</h4>
                  </div>
                  <div className="glass-card p-3 border border-slate-800 bg-slate-900/40 text-center">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Highest / Lowest</p>
                    <h4 className="text-xs font-bold text-slate-200 mt-1.5 font-mono">
                      {studentDetails.summary.highestScore.toFixed(0)}% / {studentDetails.summary.lowestScore.toFixed(0)}%
                    </h4>
                  </div>
                  <div className="glass-card p-3 border border-slate-800 bg-slate-900/40 text-center">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Status Trend</p>
                    <div className="mt-1.5 flex justify-center">{getTrendBadge(studentDetails.summary.trend)}</div>
                  </div>
                </div>

                {/* Historic Trend Graph */}
                <div className="glass-card p-4 border border-slate-850 h-[200px] flex flex-col">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Activity size={12} className="text-emerald-500" /> Historic Progress Curve</h4>
                  <div className="flex-1 relative">
                    {studentHistoryData ? (
                      <Line data={studentHistoryData} options={chartDefaults} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">Insufficient history to render progress curve</div>
                    )}
                  </div>
                </div>

                {/* Exams List */}
                <div className="flex-1 flex flex-col">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Calendar size={12} className="text-indigo-400" /> Examination Ledger</h4>
                  <div className="flex-1 overflow-y-auto space-y-2 max-h-[220px]">
                    {studentDetails.results.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">No exam logs for this student</div>
                    ) : (
                      studentDetails.results.map(r => (
                        <div key={r._id} className="flex justify-between items-center p-3 border border-slate-850 bg-slate-950/20 rounded-xl text-xs">
                          <div>
                            <p className="font-semibold text-slate-300">{r.exam?.title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{r.exam?.subject?.name || '—'} · Score: {r.obtainedMarks}/{r.totalMarks}</p>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <span className="font-mono font-bold text-indigo-400 text-xs">{r.percentage.toFixed(1)}%</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${r.isPassed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {r.grade}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
