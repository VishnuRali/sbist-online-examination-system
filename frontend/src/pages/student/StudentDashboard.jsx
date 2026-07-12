import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import { formatDateTime } from '../../utils/helpers'
import {
  Clock, BookOpen, Calendar, AlertCircle, CheckCircle,
  PlayCircle, Lock, ChevronRight, GraduationCap, KeyRound, X
} from 'lucide-react'

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [accessModalExam, setAccessModalExam] = useState(null)
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    api.get('/student/exams')
      .then(res => setExams(res.data.exams))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  const getExamState = (exam) => {
    if (exam.isCompleted) return { label: 'Completed', color: 'badge-green', icon: CheckCircle, canStart: false, btnLabel: 'View Result', btnClass: 'btn-secondary' }
    if (exam.isInProgress) return { label: 'In Progress', color: 'badge-yellow', icon: Clock, canStart: true, btnLabel: 'Resume Exam', btnClass: 'btn-warning' }
    if (exam.isExpired) return { label: 'Expired', color: 'badge-gray', icon: Lock, canStart: false, btnLabel: 'Expired', btnClass: 'btn-secondary' }
    if (exam.isUpcoming) return { label: 'Upcoming', color: 'badge-blue', icon: Calendar, canStart: false, btnLabel: 'Not Started', btnClass: 'btn-secondary' }
    if (exam.isAvailable) return { label: 'Available', color: 'badge-green', icon: PlayCircle, canStart: true, btnLabel: 'Start Exam', btnClass: 'btn-primary' }
    return { label: 'Unavailable', color: 'badge-gray', icon: Lock, canStart: false, btnLabel: 'Unavailable', btnClass: 'btn-secondary' }
  }

  const openAccessModal = (exam) => {
    setAccessModalExam(exam)
    setAccessCodeInput('')
    setAccessError('')
  }

  const closeAccessModal = () => {
    setAccessModalExam(null)
    setAccessCodeInput('')
    setAccessError('')
  }

  const submitAccessCode = (e) => {
    e.preventDefault()
    const code = accessCodeInput.trim()
    if (!/^\d{6}$/.test(code)) {
      setAccessError('Enter the 6-digit access code provided by the proctor')
      return
    }
    const examId = accessModalExam._id
    closeAccessModal()
    navigate(`/student/exam/${examId}`, { state: { accessCode: code } })
  }

  const handleAction = (exam) => {
    const state = getExamState(exam)

    if (exam.isCompleted) {
      return navigate('/student/results')
    }

    if (!state.canStart) return

    // Resume an already-started exam without asking again
    if (exam.isInProgress) {
      return navigate(`/student/exam/${exam._id}`)
    }

    // First start: always ask the student to enter the access code
    openAccessModal(exam)
  }

  const available = exams.filter(e => e.isAvailable && !e.isCompleted)
  const upcoming = exams.filter(e => e.isUpcoming)
  const completed = exams.filter(e => e.isCompleted)
  const inProgress = exams.filter(e => e.isInProgress)

  return (
    <div className="space-y-8 fade-in">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl college-header p-6 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
        </div>
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-white font-bold text-xl border border-white/30 flex-shrink-0">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-blue-200 text-sm font-medium mb-0.5">Welcome back,</p>
              <h1 className="text-2xl font-bold text-white font-['Outfit']">{user?.name}</h1>
              <div className="flex flex-wrap gap-3 mt-2">
                <span className="text-xs bg-white/15 text-white px-3 py-1 rounded-full border border-white/20">
                  🆔 {user?.studentId}
                </span>
                <span className="text-xs bg-white/15 text-white px-3 py-1 rounded-full border border-white/20">
                  🏛️ {user?.department?.name || user?.department?.code || 'N/A'}
                </span>
                <span className="text-xs bg-white/15 text-white px-3 py-1 rounded-full border border-white/20">
                  📅 Year {user?.year} | Sem {user?.semester}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Available', count: available.length + inProgress.length, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: 'Completed', count: completed.length, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Upcoming', count: upcoming.length, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`glass-card p-4 text-center border ${bg}`}>
            <p className={`text-3xl font-bold ${color} font-['Outfit']`}>{count}</p>
            <p className="text-slate-400 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* In Progress - show first */}
      {inProgress.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2 font-['Outfit']">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            Resume Exam
          </h2>
          <div className="space-y-3">
            {inProgress.map(exam => {
              const state = getExamState(exam)
              const Icon = state.icon
              return (
                <div key={exam._id} className="glass-card p-5 border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-slate-100">{exam.title}</h3>
                        <span className={`${state.color} badge`}>{state.label}</span>
                      </div>
                      <p className="text-slate-400 text-sm">{exam.subject?.name}</p>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span>⏱ {exam.duration} mins</span>
                        <span>📝 {exam.totalQuestions} Questions</span>
                        <span>🎯 {exam.totalMarks} Marks</span>
                      </div>
                    </div>
                    <button onClick={() => handleAction(exam)} className={`${state.btnClass} btn-sm flex-shrink-0 flex items-center gap-2`}>
                      <Icon size={16} />{state.btnLabel}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Available exams */}
      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-3 font-['Outfit']">
          Available Exams
        </h2>
        {loading ? (
          <div className="flex justify-center py-12"><div className="spinner"></div></div>
        ) : available.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <BookOpen size={36} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No exams available right now</p>
            <p className="text-slate-500 text-sm mt-1">Check back when your department exams are scheduled</p>
          </div>
        ) : (
          <div className="space-y-3">
            {available.map(exam => {
              const state = getExamState(exam)
              const Icon = state.icon
              return (
                <div key={exam._id} className="glass-card-hover p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-slate-100">{exam.title}</h3>
                        <span className={`${state.color} badge`}>{state.label}</span>
                      </div>
                      <p className="text-slate-400 text-sm">{exam.subject?.name}</p>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={11} /> {exam.duration} mins</span>
                        <span>📝 {exam.totalQuestions} Questions</span>
                        <span>🎯 {exam.totalMarks} Marks</span>
                        <span className="flex items-center gap-1"><Calendar size={11} /> Ends: {formatDateTime(exam.endTime)}</span>
                      </div>
                    </div>
                    <button onClick={() => handleAction(exam)} className={`${state.btnClass} btn-sm flex-shrink-0 flex items-center gap-2`}>
                      <Icon size={16} />{state.btnLabel}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-3 font-['Outfit']">Upcoming Exams</h2>
          <div className="space-y-3">
            {upcoming.map(exam => (
              <div key={exam._id} className="glass-card p-5 opacity-75">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-200">{exam.title}</h3>
                      <span className="badge badge-blue">Upcoming</span>
                    </div>
                    <p className="text-slate-400 text-sm">{exam.subject?.name}</p>
                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                      <span>⏱ {exam.duration} mins</span>
                      <span>📝 {exam.totalQuestions} Qs</span>
                      <span className="flex items-center gap-1"><Calendar size={11} /> Starts: {formatDateTime(exam.startTime)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Lock size={16} />
                    <span className="text-xs">Not started</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-3 font-['Outfit']">Completed Exams</h2>
          <div className="space-y-3">
            {completed.map(exam => (
              <div key={exam._id} className="glass-card p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-200">{exam.title}</h3>
                      <span className="badge badge-green">Completed</span>
                    </div>
                    <p className="text-slate-400 text-sm">{exam.subject?.name}</p>
                  </div>
                  <button onClick={() => navigate('/student/results')} className="btn-secondary btn-sm flex items-center gap-2">
                    <CheckCircle size={14} /> View Result
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Access code modal — first start only */}
      {accessModalExam && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md slide-up">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" />
                <h2 className="text-lg font-bold text-slate-100">Enter Access Code</h2>
              </div>
              <button type="button" onClick={closeAccessModal} className="btn-icon text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitAccessCode} className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                Enter the 6-digit code announced by the exam proctor to start{' '}
                <span className="text-slate-200 font-semibold">{accessModalExam.title}</span>.
              </p>
              <div>
                <label className="input-label">Access Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoFocus
                  value={accessCodeInput}
                  onChange={e => {
                    setAccessCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                    setAccessError('')
                  }}
                  className="input-field font-mono tracking-[0.35em] text-center text-lg"
                  placeholder="••••••"
                  required
                />
                {accessError && (
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> {accessError}
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeAccessModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Continue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
