import { useEffect, useState } from 'react'
import api from '../../utils/api'
import { formatDateTime, getGradeColor } from '../../utils/helpers'
import { Trophy, FileText, Clock, CheckCircle, XCircle, Award, Download, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ResultPage() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [expandedSubjects, setExpandedSubjects] = useState({})

  const downloadPDF = async (resultId, examTitle) => {
    setDownloading(resultId)
    try {
      const res = await api.get(`/result/${resultId}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `result_${examTitle?.replace(/\s+/g, '_') || resultId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Result PDF downloaded!')
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      setDownloading(null)
    }
  }

  const toggleSubjectBreakdown = (resultId) => {
    setExpandedSubjects(prev => ({ ...prev, [resultId]: !prev[resultId] }))
  }

  useEffect(() => {
    api.get('/student/results')
      .then(res => setResults(res.data.results))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="spinner"></div>
    </div>
  )

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">My Results</h1>
        <p className="text-slate-400 text-sm">{results.length} exam{results.length !== 1 ? 's' : ''} completed</p>
      </div>

      {results.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <FileText size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg font-medium">No results yet</p>
          <p className="text-slate-500 text-sm">Your exam results will appear here after submission</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map(r => {
            const isMulti = r.exam?.examType === 'multi' && r.subjectResults?.length > 0
            const isExpanded = expandedSubjects[r._id]

            return (
              <div key={r._id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-100">{r.exam?.title}</h3>
                      <span className={`badge font-semibold ${r.isPassed ? 'badge-green' : 'badge-red'}`}>
                        {r.isPassed ? 'PASS' : 'FAIL'}
                      </span>
                      {isMulti && (
                        <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs">
                          <Layers size={10} className="inline mr-0.5" />
                          Multi-Subject
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mb-3">
                      {isMulti
                        ? r.exam?.subjects?.map(s => s.subjectName).join(' · ')
                        : r.exam?.subject?.name}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="flex items-center gap-1 text-slate-300">
                        <Trophy size={14} className="text-amber-400" />
                        <strong>{r.obtainedMarks}/{r.totalMarks}</strong>
                      </span>
                      <span className={`font-bold text-base ${getGradeColor(r.grade)}`}>
                        Grade: {r.grade}
                      </span>
                      <span className="text-slate-400">{r.percentage?.toFixed(1)}%</span>
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle size={12} /> {r.correctAnswers} correct
                      </span>
                      <span className="flex items-center gap-1 text-red-400 text-xs">
                        <XCircle size={12} /> {r.wrongAnswers} wrong
                      </span>
                      <span className="flex items-center gap-1 text-slate-500 text-xs">
                        <Clock size={12} /> {formatDateTime(r.submittedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-extrabold ${
                      r.isPassed ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-red-500/15 border border-red-500/30'
                    }`}>
                      <span className={getGradeColor(r.grade)}>{r.grade}</span>
                    </div>
                    <span className="text-xs text-slate-500">Grade</span>
                    {r.exam?.allowDownloadResult !== false && (
                      <button
                        onClick={() => downloadPDF(r._id, r.exam?.title)}
                        disabled={downloading === r._id}
                        className="btn-secondary btn-sm text-xs flex items-center gap-1 mt-1 py-1.5 px-3"
                        title="Download PDF Result"
                      >
                        {downloading === r._id ? <div className="spinner w-3 h-3" /> : <Download size={12} />}
                        PDF
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Score Progress</span>
                    <span>{r.percentage?.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        r.isPassed ? 'bg-gradient-to-r from-emerald-500 to-green-400' : 'bg-gradient-to-r from-red-500 to-rose-400'
                      }`}
                      style={{ width: `${r.percentage || 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* Overall stats row */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Total', value: r.totalMarks, color: 'text-slate-300' },
                    { label: 'Obtained', value: r.obtainedMarks, color: 'text-blue-400' },
                    { label: 'Correct', value: r.correctAnswers, color: 'text-emerald-400' },
                    { label: 'Skipped', value: r.skippedAnswers, color: 'text-slate-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center bg-slate-800/40 rounded-xl p-2.5 border border-slate-700/30">
                      <p className={`text-lg font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Subject-wise breakdown (multi-subject only) */}
                {isMulti && (
                  <div className="mt-4">
                    <button
                      onClick={() => toggleSubjectBreakdown(r._id)}
                      className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
                    >
                      <Layers size={13} />
                      Subject-wise Breakdown
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700/50">
                              <th className="text-left text-slate-400 pb-2 pr-4 font-medium">Subject</th>
                              <th className="text-center text-slate-400 pb-2 px-3 font-medium">Obtained</th>
                              <th className="text-center text-slate-400 pb-2 px-3 font-medium">Total</th>
                              <th className="text-center text-slate-400 pb-2 px-3 font-medium">Pass Marks</th>
                              <th className="text-center text-slate-400 pb-2 px-3 font-medium">%</th>
                              <th className="text-center text-slate-400 pb-2 px-3 font-medium">Correct</th>
                              <th className="text-center text-slate-400 pb-2 px-3 font-medium">Wrong</th>
                              <th className="text-center text-slate-400 pb-2 pl-3 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.subjectResults.map((sr, si) => (
                              <tr key={si} className="border-b border-slate-800/50 last:border-0">
                                <td className="py-2 pr-4 text-slate-200 font-medium">{sr.subjectName}</td>
                                <td className="py-2 px-3 text-center text-blue-400 font-bold">{sr.obtainedMarks}</td>
                                <td className="py-2 px-3 text-center text-slate-400">{sr.totalMarks}</td>
                                <td className="py-2 px-3 text-center text-slate-400">{sr.passMarks}</td>
                                <td className="py-2 px-3 text-center text-slate-300">{sr.percentage?.toFixed(1)}%</td>
                                <td className="py-2 px-3 text-center text-emerald-400">{sr.correctAnswers}</td>
                                <td className="py-2 px-3 text-center text-red-400">{sr.wrongAnswers}</td>
                                <td className="py-2 pl-3 text-center">
                                  <span className={`badge text-xs font-semibold ${sr.isPassed ? 'badge-green' : 'badge-red'}`}>
                                    {sr.isPassed ? 'PASS' : 'FAIL'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
