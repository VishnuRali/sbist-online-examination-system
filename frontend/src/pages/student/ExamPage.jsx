import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import AIProctor from '../../components/student/AIProctor'
import { formatTime } from '../../utils/helpers'
import {
  Clock, AlertTriangle, ChevronLeft, ChevronRight,
  Flag, Send, Maximize, Eye, EyeOff, BookOpen, KeyRound,
  CameraOff, AlertCircle
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────
// Question Palette
// ──────────────────────────────────────────────────────────────
const QuestionPalette = ({ questions, answers, reviewList, currentIdx, onJump }) => {
  const getStatus = (i) => {
    const qId = questions[i]?._id?.toString()
    const answered = !!answers[qId]
    const marked = reviewList.includes(qId)
    if (answered && marked) return 'q-btn-marked-answered'
    if (marked) return 'q-btn-marked'
    if (answered) return 'q-btn-answered'
    if (i < currentIdx) return 'q-btn-not-answered'
    return 'q-btn-not-visited'
  }

  return (
    <div className="h-full flex flex-col">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 pt-4 pb-2">
        Question Palette
      </p>
      {/* Legend */}
      <div className="px-4 pb-3 space-y-1.5">
        {[
          { cls: 'bg-emerald-600', label: 'Answered' },
          { cls: 'bg-red-600/80', label: 'Not Answered' },
          { cls: 'bg-amber-500', label: 'Marked for Review' },
          { cls: 'bg-purple-600', label: 'Answered & Marked' },
          { cls: 'bg-slate-700', label: 'Not Visited' },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-400">
            <div className={`w-3.5 h-3.5 rounded ${cls} flex-shrink-0`}></div>
            {label}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-5 gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => onJump(i)}
              className={`q-btn ${getStatus(i)} ${i === currentIdx ? 'q-btn-current' : ''}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 pb-4 border-t border-slate-700/50 pt-3 space-y-1">
        {[
          { label: 'Total', value: questions.length, color: 'text-slate-300' },
          { label: 'Answered', value: questions.filter(q => !!answers[q._id?.toString()]).length, color: 'text-emerald-400' },
          { label: 'Not Answered', value: questions.filter(q => !answers[q._id?.toString()]).length, color: 'text-red-400' },
          { label: 'Marked', value: reviewList.length, color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-slate-400">{label}</span>
            <span className={`font-bold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main Exam Page
// ──────────────────────────────────────────────────────────────
const inFlightRequests = {};

export default function ExamPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Core state
  const [examData, setExamData] = useState(null)   // exam info + questions
  const [resultId, setResultId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})         // { questionId: 'A'|'B'|'C'|'D' }
  const [reviewList, setReviewList] = useState([])   // [questionId]
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [violations, setViolations] = useState(0)
  const [maxViolations, setMaxViolations] = useState(3)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const [violationMsg, setViolationMsg] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Multi-subject state
  const [currentSubjectIndex, setCurrentSubjectIndex] = useState(0)
  const [totalSubjects, setTotalSubjects] = useState(1)
  const [currentSubjectName, setCurrentSubjectName] = useState('')
  const [completedSubjects, setCompletedSubjects] = useState([])
  const [subjectTransitioning, setSubjectTransitioning] = useState(false)
  // Access code gate (first start only; shown when missing/invalid)
  const [needsAccessCode, setNeedsAccessCode] = useState(false)
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [accessCodeError, setAccessCodeError] = useState('')
  const [startingWithCode, setStartingWithCode] = useState(false)
  const [webcamPermissionGranted, setWebcamPermissionGranted] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const autoSaveRef = useRef(null)
  const timerRef = useRef(null)
  const violationLockRef = useRef(false)
  // Unique ID for this browser tab
  const examTabIdRef = useRef(crypto.randomUUID())
  // Ref that mirrors submitted state but is updated SYNCHRONOUSLY.
  // Used by event handlers whose closures capture stale state.
  const submittedRef = useRef(false)

  const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'saving' | 'error'
  const saveInProgressRef = useRef(false)
  const lastSavedSnapshotRef = useRef({ answers: {}, reviewList: [], currentIdx: null, currentSubjectIndex: null })

  const applyStartResponse = useCallback((data) => {
    const { exam, questions: qs, result, remainingSeconds,
      currentSubjectIndex: csi, totalSubjects: ts, currentSubject } = data
    setExamData(exam)
    setQuestions(qs)
    setResultId(result._id)
    setTimeLeft(remainingSeconds)
    setViolations(result.violations || 0)
    setMaxViolations(exam.enableAIProctoring ? 2 : (exam.maxViolations || 3))
    setCurrentSubjectIndex(csi || 0)
    setTotalSubjects(ts || 1)
    setCurrentSubjectName(currentSubject?.subjectName || exam.subjects?.[0]?.subjectName || '')
    setCompletedSubjects(result.savedProgress?.completedSubjects || [])

    const saved = result.savedProgress?.answers || {}
    setAnswers(typeof saved === 'object' && !(saved instanceof Map) ? saved : {})
    setReviewList(result.savedProgress?.reviewList || [])
    setCurrentIdx(result.savedProgress?.currentQuestion || 0)
    setNeedsAccessCode(false)
    setAccessCodeError('')

    lastSavedSnapshotRef.current = {
      answers: typeof saved === 'object' && !(saved instanceof Map) ? { ...saved } : {},
      reviewList: [...(result.savedProgress?.reviewList || [])],
      currentIdx: result.savedProgress?.currentQuestion || 0,
      currentSubjectIndex: csi || 0
    }
  }, [])

  const startExamRequest = useCallback(async (accessCode) => {
    if (inFlightRequests[examId]) {
      return inFlightRequests[examId];
    }
    const body = accessCode ? { accessCode } : {}
    const promise = api.post(`/student/exams/${examId}/start`, body)
      .then(res => {
        applyStartResponse(res.data);
        // Clear location state so refresh resumes without re-prompting
        if (location.state?.accessCode) {
          navigate(location.pathname, { replace: true, state: {} })
        }
        return res.data;
      })
      .catch(err => {
        throw err;
      })
      .finally(() => {
        delete inFlightRequests[examId];
      });

    inFlightRequests[examId] = promise;
    return promise;
  }, [examId, applyStartResponse, location.pathname, location.state?.accessCode, navigate])

  // ── Load exam ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const codeFromNav = location.state?.accessCode
        await startExamRequest(codeFromNav)
      } catch (err) {
        const errorMsg = err.response?.data?.message || 'Failed to start exam'
        const lower = errorMsg.toLowerCase()
        if (lower.includes('already submitted')) {
          toast.success('This exam has already been submitted. Redirecting to your results.', { id: 'already-submitted-toast' })
          navigate('/student/results', { replace: true })
        } else if (lower.includes('access code')) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { })
          }
          setNeedsAccessCode(true)
          setAccessCodeError(errorMsg)
          setLoading(false)
        } else {
          toast.error(errorMsg, { id: 'exam-start-err' })
          navigate('/student', { replace: true })
        }
      } finally {
        setLoading(false)
      }
    }
    load()

    // Attempt fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { })
    }

    return () => {
      clearInterval(autoSaveRef.current)
      clearInterval(timerRef.current)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { })
    }
  }, [examId])

  // ── Prevent exam from opening in multiple tabs ──────────────
  useEffect(() => {
    if (!resultId || submitted) return

    const channel = new BroadcastChannel(`exam-${resultId}`)
    const currentTabId = examTabIdRef.current

    channel.postMessage({
      type: 'CHECK_ACTIVE_EXAM_TAB',
      tabId: currentTabId,
    })

    const handleMessage = (event) => {
      const { type, tabId } = event.data || {}

      if (type === 'CHECK_ACTIVE_EXAM_TAB' && tabId !== currentTabId) {
        channel.postMessage({
          type: 'EXAM_TAB_ALREADY_ACTIVE',
          targetTabId: tabId,
        })
      }

      if (
        type === 'EXAM_TAB_ALREADY_ACTIVE' &&
        event.data.targetTabId === currentTabId
      ) {
        toast.error(
          'This exam is already open in another tab. Please continue there.',
          { id: 'duplicate-exam-tab' }
        )

        setTimeout(() => {
          navigate('/student/dashboard', { replace: true })
        }, 1500)
      }
    }

    channel.addEventListener('message', handleMessage)

    return () => {
      channel.removeEventListener('message', handleMessage)
      channel.close()
    }
  }, [resultId, submitted, navigate])



  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!resultId || timeLeft <= 0 || submitted) return

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          handleAutoSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [resultId, submitted])


  const handleAutoSubmit = async (reason = 'Prohibited exam activity detected') => {
    if (submittedRef.current || submitting || submitted) return
    setSubmitting(true)
    submittedRef.current = true
    try {
      clearInterval(autoSaveRef.current)
      clearInterval(timerRef.current)

      const res = await api.post('/student/exams/submit', { resultId, answers, reviewList, submissionType: 'auto_submitted', autoSubmitReason: reason })
      setSubmitResult(res.data.result)
      setSubmitted(true)

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { })
      }
      toast.success('Exam submitted successfully.', { id: 'exam-submit-status' })
    } catch { }

    setTimeout(() => {
      navigate('/student/results', { replace: true })
    }, 1500)
  }

  // ── Anti-cheat: visibility/blur ───────────────────────────
  useEffect(() => {
    // Remove all anti-cheat listeners once exam is submitted.
    if (submitted) return

    const handleVisibilityChange = () => {
      if (document.hidden && !submittedRef.current) {
        handleAutoSubmit('Tab switching detected')
      }
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !submittedRef.current) {
        handleAutoSubmit('Exited fullscreen')
      }
    }
    const preventContextMenu = (e) => e.preventDefault()
    const preventCopy = (e) => e.preventDefault()
    const preventTextSelection = (e) => e.preventDefault()
    const preventKeyboard = (e) => {
      // Block common cheat shortcuts
      if (
        (e.ctrlKey && ['c', 'v', 'a', 'p', 's', 'u', 'n', 't'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        e.altKey
      ) {
        e.preventDefault()
        handleAutoSubmit(`Blocked keyboard shortcut: ${e.key}`)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('contextmenu', preventContextMenu)
    document.addEventListener('copy', preventCopy)
    document.addEventListener('paste', preventCopy)
    document.addEventListener('cut', preventCopy)
    document.addEventListener('selectstart', preventTextSelection)
    document.addEventListener('keydown', preventKeyboard)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('copy', preventCopy)
      document.removeEventListener('paste', preventCopy)
      document.removeEventListener('cut', preventCopy)
      document.removeEventListener('selectstart', preventTextSelection)
      document.removeEventListener('keydown', preventKeyboard)
    }
  }, [submitted, resultId])


  // ── Save progress ─────────────────────────────────────────
  const saveProgress = useCallback(async (showToast = false) => {
    if (!resultId || submittedRef.current || submitted) return
    if (saveInProgressRef.current) return

    const currentSnapshot = {
      answers,
      reviewList,
      currentIdx,
      currentSubjectIndex,
    }

    const isDifferent =
      JSON.stringify(currentSnapshot.answers) !== JSON.stringify(lastSavedSnapshotRef.current.answers) ||
      JSON.stringify(currentSnapshot.reviewList) !== JSON.stringify(lastSavedSnapshotRef.current.reviewList) ||
      currentSnapshot.currentIdx !== lastSavedSnapshotRef.current.currentIdx ||
      currentSnapshot.currentSubjectIndex !== lastSavedSnapshotRef.current.currentSubjectIndex

    if (!showToast && !isDifferent) {
      return
    }

    saveInProgressRef.current = true
    setSaveStatus('saving')

    const doSave = async (isRetry = false) => {
      try {
        await api.post('/student/exams/save-progress', {
          resultId,
          answers: currentSnapshot.answers,
          currentQuestion: currentSnapshot.currentIdx,
          reviewList: currentSnapshot.reviewList,
          currentSubjectIndex: currentSnapshot.currentSubjectIndex,
        })
        lastSavedSnapshotRef.current = {
          answers: { ...currentSnapshot.answers },
          reviewList: [...currentSnapshot.reviewList],
          currentIdx: currentSnapshot.currentIdx,
          currentSubjectIndex: currentSnapshot.currentSubjectIndex,
        }
        setSaveStatus('saved')
        saveInProgressRef.current = false
        if (showToast) toast.success('Progress saved', { duration: 1500 })
      } catch (err) {
        if (!isRetry) {
          setTimeout(() => {
            doSave(true)
          }, 2000)
        } else {
          setSaveStatus('error')
          saveInProgressRef.current = false
          console.error('Autosave failed after retry')
        }
      }
    }

    await doSave(false)
  }, [resultId, answers, currentIdx, reviewList, currentSubjectIndex, submitted])

  const saveProgressRef = useRef(saveProgress)
  useEffect(() => {
    saveProgressRef.current = saveProgress
  }, [saveProgress])

  // ── Auto-save every 5 seconds ─────────────────────────────
  useEffect(() => {
    if (!resultId || submitted) return
    autoSaveRef.current = setInterval(() => {
      saveProgressRef.current(false)
    }, 5000)
    return () => clearInterval(autoSaveRef.current)
  }, [resultId, submitted])

  const handlePermissionChange = useCallback((granted, errorObj = null) => {
    setWebcamPermissionGranted(granted)
    if (errorObj) {
      setCameraError(errorObj)
    } else if (granted === true) {
      setCameraError(null)
    }
  }, [])

  const handleRetryCamera = useCallback(() => {
    setWebcamPermissionGranted(null)
    setCameraError(null)
    setRetryTrigger(prev => prev + 1)
  }, [])

  // ── Violation handler ─────────────────────────────────────
  const triggerViolation = useCallback(async (type) => {
    // Use the ref (not state) so closures with stale `submitted` still see the latest value
    if (violationLockRef.current || submittedRef.current) return
    violationLockRef.current = true
    setTimeout(() => { violationLockRef.current = false }, 5000) // 5s debounce/cooldown

    const newCount = violations + 1
    setViolations(newCount)
    setViolationMsg(type)

    const isProctored = examData?.enableAIProctoring
    if (!isProctored || newCount < 2) {
      setShowViolationWarning(true)
    }

    // Local check to immediately auto-submit even when offline
    if (newCount >= maxViolations) {
      toast.error('Maximum violations reached. Exam auto-submitted.')
      const reason = isProctored
        ? 'Exam automatically submitted due to AI Proctoring violation.'
        : 'Prohibited exam activity detected'
      handleAutoSubmit(reason)

      // Queue locally so the database still logs this event when synced
      const QUEUE_KEY = `offline-violations-${resultId}`;
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ resultId, violationType: type, timestamp: new Date().toISOString() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      return;
    }

    try {
      await api.post('/student/exams/violation', { resultId, violationType: type })
    } catch (err) {
      // If network is offline, queue violation event in local storage
      const isNetworkError = !err.response || err.response.status >= 500;
      if (isNetworkError) {
        const QUEUE_KEY = `offline-violations-${resultId}`;
        const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        queue.push({ resultId, violationType: type, timestamp: new Date().toISOString() });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      }
    }
  }, [violations, resultId, examData, maxViolations])




  // ── Switch subject (multi-subject free navigation) ─────────
  const handleSwitchSubject = async (targetIndex) => {
    if (submitting || subjectTransitioning || submitted || submittedRef.current) return
    if (targetIndex === currentSubjectIndex) return
    if (targetIndex < 0 || targetIndex >= totalSubjects) return

    setSubjectTransitioning(true)
    try {
      const res = await api.post('/student/exams/switch-subject', {
        resultId,
        subjectIndex: targetIndex,
        answers,
        reviewList,
        currentQuestion: currentIdx,
      })
      const data = res.data
      setQuestions(data.questions || [])
      setCurrentIdx(0)
      // Keep merged answers across subjects (prefer server merge if returned)
      if (data.answers && typeof data.answers === 'object') {
        setAnswers(data.answers)
      }
      setReviewList([])
      setCurrentSubjectIndex(data.currentSubjectIndex)
      setCurrentSubjectName(data.currentSubject?.subjectName || '')
      setCompletedSubjects(data.completedSubjects || [])

      lastSavedSnapshotRef.current = {
        answers: data.answers && typeof data.answers === 'object' ? { ...data.answers } : {},
        reviewList: [],
        currentIdx: 0,
        currentSubjectIndex: data.currentSubjectIndex
      }

      // Shared timer — do not reset from response if local countdown is already running;
      // only sync if server remaining is lower (clock skew / late switch)
      if (typeof data.remainingSeconds === 'number') {
        setTimeLeft(t => Math.min(t, data.remainingSeconds))
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to switch subject')
    } finally {
      setSubjectTransitioning(false)
    }
  }

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting || submitted || submittedRef.current) return
    setSubmitting(true)
    setShowSubmitConfirm(false)
    try {
      // Stop all intervals immediately
      clearInterval(autoSaveRef.current)
      clearInterval(timerRef.current)

      await saveProgress(false)
      const res = await api.post('/student/exams/submit', { resultId, answers, reviewList })
      setSubmitResult(res.data.result)

      // Mark submitted via ref BEFORE exiting fullscreen
      submittedRef.current = true
      setSubmitted(true)

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { })
      }

      if (res.data.alreadySubmitted) {
        toast.success('This exam has already been submitted. Redirecting to your results.', { id: 'exam-submit-status' })
      } else {
        toast.success('Exam submitted successfully.', { id: 'exam-submit-status' })
      }

      setTimeout(() => {
        navigate('/student/results', { replace: true })
      }, 1500)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed. Try again.', { id: 'exam-submit-status' })
      setSubmitting(false)
    }
  }



  // ── Navigation ────────────────────────────────────────────
  const currentQ = questions[currentIdx]
  const currentQId = currentQ?._id?.toString()

  const selectAnswer = (option) => {
    setAnswers(prev => ({ ...prev, [currentQId]: option }))
  }

  const clearAnswer = () => {
    setAnswers(prev => ({ ...prev, [currentQId]: null }))
  }

  const toggleReview = () => {
    setReviewList(prev =>
      prev.includes(currentQId) ? prev.filter(id => id !== currentQId) : [...prev, currentQId]
    )
  }

  const isMarked = reviewList.includes(currentQId)
  const selectedOption = answers[currentQId]

  const timerDanger = timeLeft <= 300 // 5 minutes warning
  const timerWarning = timeLeft <= 600 // 10 minutes

  const handleAccessCodeSubmit = async (e) => {
    e.preventDefault()
    const code = accessCodeInput.trim()
    if (!/^\d{6}$/.test(code)) {
      setAccessCodeError('Enter the 6-digit access code provided by the proctor')
      return
    }
    setStartingWithCode(true)
    setAccessCodeError('')
    try {
      setLoading(true)
      await startExamRequest(code)
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Invalid access code'
      setAccessCodeError(errorMsg)
      toast.error(errorMsg, { id: 'exam-access-code-err' })
    } finally {
      setStartingWithCode(false)
      setLoading(false)
    }
  }

  // ── Submitted screen ──────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="glass-card w-full max-w-lg p-8 text-center slide-up">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl bg-emerald-500/20 border border-emerald-500/40">
            🎉
          </div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit'] mb-2">
            Exam Submitted!
          </h1>
          <p className="text-slate-400 mb-6">
            Your exam was submitted successfully. Preparing your result...
          </p>
          <div className="spinner mx-auto mb-4 !w-8 !h-8 !border-t-emerald-500"></div>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="spinner mx-auto mb-4 !w-10 !h-10"></div>
        <p className="text-slate-300 text-lg font-medium">Loading exam...</p>
        <p className="text-slate-500 text-sm mt-1">Please wait</p>
      </div>
    </div>
  )

  // Webcam access check handled in-line inside return block to prevent unmounting AIProctor component

  if (needsAccessCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="glass-card w-full max-w-md p-6 slide-up">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound size={20} className="text-amber-400" />
            <h1 className="text-lg font-bold text-slate-100">Enter Access Code</h1>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Enter the 6-digit code announced by the exam proctor to begin.
          </p>
          <form onSubmit={handleAccessCodeSubmit} className="space-y-4">
            <div>
              <label className="input-label">Access Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={accessCodeInput}
                onChange={e => {
                  setAccessCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setAccessCodeError('')
                }}
                className="input-field font-mono tracking-[0.35em] text-center text-lg"
                placeholder="••••••"
                required
              />
              {accessCodeError && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={12} /> {accessCodeError}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => navigate('/student', { replace: true })} className="btn-secondary flex-1">
                Back
              </button>
              <button type="submit" disabled={startingWithCode} className="btn-primary flex-1">
                {startingWithCode ? 'Starting...' : 'Start Exam'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Map exact camera error details
  let errorTitle = "Camera Access Required";
  let errorMessage = "This exam requires webcam access for AI Proctoring.";
  let errorInstructions = (
    <>
      1. Click the site settings icon (lock or sliders) next to the URL address bar.
      <br />
      2. Change Camera permission to <strong>Allow</strong>.
      <br />
      3. Click the <strong>Retry Camera Access</strong> button below.
    </>
  );
  let ErrorIcon = EyeOff;
  let errorColorClass = "text-red-500 border-red-500/20 bg-red-500/10";
  let borderClass = "border-red-500/30";

  if (cameraError) {
    const name = cameraError.name;
    const msg = cameraError.message;

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      errorTitle = "Camera Access Required";
      errorMessage = "Webcam access is blocked in your browser settings. AI Proctoring requires camera permission to verify your identity.";
      ErrorIcon = EyeOff;
      errorColorClass = "text-red-400 border-red-500/20 bg-red-500/10";
      borderClass = "border-red-500/30";
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      errorTitle = "Webcam Hardware Not Detected";
      errorMessage = "No webcam device was found connected to this computer. Please connect a working webcam.";
      errorInstructions = (
        <>
          1. Check that your webcam is properly plugged in/connected.
          <br />
          2. Ensure your computer recognizes the webcam.
          <br />
          3. Click the <strong>Retry Camera Access</strong> button to scan again.
        </>
      );
      ErrorIcon = CameraOff;
      errorColorClass = "text-rose-400 border-rose-500/20 bg-rose-500/10";
      borderClass = "border-rose-500/30";
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      errorTitle = "Webcam Already in Use";
      errorMessage = "Your webcam is currently being used by another application (e.g. Zoom, Microsoft Teams, Google Meet) or another browser tab.";
      errorInstructions = (
        <>
          1. Close all other browser tabs and apps using your webcam.
          <br />
          2. Make sure no other program is capturing your camera.
          <br />
          3. Click the <strong>Retry Camera Access</strong> button to take control.
        </>
      );
      ErrorIcon = AlertTriangle;
      errorColorClass = "text-amber-400 border-amber-500/20 bg-amber-500/10";
      borderClass = "border-amber-500/30";
    } else if (name === 'SecurityError') {
      errorTitle = "Camera Access Blocked (Security)";
      errorMessage = "Camera access is disabled due to non-secure origin or security protocol policies (e.g., non-HTTPS link).";
      errorInstructions = (
        <>
          1. Ensure the web address starts with <strong>https://</strong>.
          <br />
          2. Check your browser security policies regarding media hardware.
          <br />
          3. Access the exam via a secure browser window.
        </>
      );
      ErrorIcon = AlertCircle;
      errorColorClass = "text-red-400 border-red-500/20 bg-red-500/10";
      borderClass = "border-red-500/30";
    } else {
      errorTitle = "Camera Initialization Failed";
      errorMessage = `An unexpected error occurred while starting your camera: ${msg}`;
      errorInstructions = (
        <>
          1. Disconnect and reconnect your webcam, or restart your browser.
          <br />
          2. Make sure you don't have constraints blocking the camera.
          <br />
          3. Click the <strong>Retry Camera Access</strong> button to initialize again.
        </>
      );
      ErrorIcon = AlertCircle;
      errorColorClass = "text-amber-400 border-amber-500/20 bg-amber-500/10";
      borderClass = "border-amber-500/30";
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-950 no-select" style={{ userSelect: 'none' }}>
      {examData?.enableAIProctoring && webcamPermissionGranted === null ? (
        <div className="min-h-screen flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className="text-center">
            <div className="spinner mx-auto mb-4 !w-10 !h-10"></div>
            <p className="text-slate-300 text-lg font-medium">Initializing Camera & AI Proctor...</p>
            <p className="text-slate-500 text-sm mt-1">Please allow camera access when prompted</p>
          </div>
        </div>
      ) : examData?.enableAIProctoring && webcamPermissionGranted === false ? (
        <div className="min-h-screen flex-1 flex items-center justify-center p-6 bg-slate-950">
          <div className={`glass-card w-full max-w-md p-8 text-center slide-up ${borderClass}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 border ${errorColorClass}`}>
              <ErrorIcon size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-100 font-['Outfit'] mb-3">{errorTitle}</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              {errorMessage}
              <br />
              <span className="text-xs text-slate-500 block mt-4 text-left bg-slate-900/60 p-3 rounded-lg border border-slate-800 font-sans leading-relaxed">
                {errorInstructions}
              </span>
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleRetryCamera}
                className="btn-primary w-full flex items-center justify-center gap-2 cursor-pointer"
              >
                Retry Camera Access
              </button>
              <button
                onClick={() => navigate('/student/dashboard')}
                className="btn-secondary w-full cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top Bar ─────────────────────────────────────────── */}
          <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700/50 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen size={14} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-100 truncate font-['Outfit']">{examData?.title}</h1>
                <p className="text-xs text-slate-500">Q {currentIdx + 1} of {questions.length}</p>
              </div>
            </div>

            {/* Timer */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-base font-mono tabular-nums ${timerDanger ? 'bg-red-500/20 border border-red-500/40 text-red-400 timer-danger' :
              timerWarning ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400' :
                'bg-slate-800 border border-slate-700 text-slate-200'
              }`}>
              <Clock size={16} className={timerDanger ? 'text-red-400' : timerWarning ? 'text-amber-400' : 'text-slate-400'} />
              {formatTime(timeLeft)}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              {/* Violations indicator */}
              {violations > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded-xl">
                  <AlertTriangle size={13} className="text-red-400" />
                  <span className="text-red-400 text-xs font-semibold">{violations}/{maxViolations}</span>
                </div>
              )}

              <button
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen().then(() => setIsFullscreen(false))
                  } else {
                    document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { })
                  }
                }}
                className="btn-icon text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                title="Toggle Fullscreen"
              >
                <Maximize size={16} />
              </button>

              {saveStatus === 'error' && (
                <span className="text-xs text-red-400 font-medium mr-2 animate-pulse" id="save-status-indicator">
                  not saved, retrying...
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-xs text-blue-400 font-medium mr-2" id="save-status-indicator">
                  Saving...
                </span>
              )}
              <button
                onClick={() => { saveProgress(true) }}
                className="btn-secondary btn-sm text-xs"
              >
                Save
              </button>

              {/* Multi-subject: show only submit exam button (per-subject submit is at nav footer) */}
              <button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={submitting || subjectTransitioning}
                className="btn-danger btn-sm flex items-center gap-1.5 text-xs"
              >
                <Send size={14} /> Submit Exam
              </button>
            </div>
          </header>

          {/* Multi-subject tabs — clickable free navigation */}
          {totalSubjects > 1 && (
            <div className="flex-shrink-0 bg-slate-900/80 border-b border-slate-800 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Subjects:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Array.from({ length: totalSubjects }).map((_, i) => {
                    const isActive = i === currentSubjectIndex
                    const isVisited = completedSubjects.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSwitchSubject(i)}
                        disabled={subjectTransitioning || isActive}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${isActive
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 cursor-default'
                          : isVisited
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer'
                            : 'bg-slate-800/50 border-slate-700/40 text-slate-400 hover:border-slate-500 hover:text-slate-200 cursor-pointer'
                          } disabled:opacity-60`}
                        title={isActive ? 'Current subject' : `Switch to ${examData?.subjects?.[i]?.subjectName || `Subject ${i + 1}`}`}
                      >
                        {isVisited && !isActive ? '✓ ' : ''}
                        {examData?.subjects?.[i]?.subjectName || `Subject ${i + 1}`}
                      </button>
                    )
                  })}
                </div>
                {subjectTransitioning && (
                  <span className="text-xs text-slate-500">Switching…</span>
                )}
              </div>
            </div>
          )}

          {/* ── Progress bar ─────────────────────────────────────── */}
          <div className="progress-bar h-1 rounded-none flex-shrink-0">
            <div className="progress-fill rounded-none" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}></div>
          </div>

          {/* ── Body ─────────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden flex">
            {/* Question area */}
            <main className="flex-1 overflow-y-auto flex flex-col">
              {currentQ && (
                <div className="flex-1 p-5 md:p-6 max-w-4xl mx-auto w-full">
                  {/* Question header */}
                  <div className="flex items-start gap-3 mb-5">
                    <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/40 rounded-xl flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
                      {currentIdx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {currentQ.topic && <span className="badge badge-blue text-xs">{currentQ.topic}</span>}
                        <span className="text-xs text-slate-500">{currentQ.marks} mark{currentQ.marks !== 1 ? 's' : ''}</span>
                      </div>
                      <p className="text-slate-100 text-base leading-relaxed font-medium">{currentQ.questionText}</p>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-3">
                    {['A', 'B', 'C', 'D'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => selectAnswer(opt)}
                        className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-150 active:scale-[0.995] ${selectedOption === opt
                          ? 'border-blue-500 bg-blue-600/15 text-slate-100'
                          : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:bg-slate-700/40'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 transition-all ${selectedOption === opt
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-400'
                          }`}>
                          {opt}
                        </div>
                        <span className="leading-snug">{currentQ.options[opt]}</span>
                        {selectedOption === opt && (
                          <div className="ml-auto w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Question actions */}
                  <div className="flex items-center gap-3 mt-6">
                    {selectedOption && (
                      <button onClick={clearAnswer} className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
                        <EyeOff size={13} /> Clear
                      </button>
                    )}
                    <button
                      onClick={toggleReview}
                      className={`btn-sm flex items-center gap-1.5 text-xs ${isMarked ? 'btn-warning' : 'btn-secondary'
                        }`}
                    >
                      <Flag size={13} />
                      {isMarked ? 'Unmark Review' : 'Mark for Review'}
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation footer */}
              <div className="flex items-center justify-between px-5 md:px-6 py-4 border-t border-slate-800 flex-shrink-0 bg-slate-900/50">
                <button
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="btn-secondary btn-sm flex items-center gap-2 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                <div className="flex items-center gap-2">
                  {/* Jump to any Q on mobile */}
                  <button
                    onClick={() => setPaletteOpen(!paletteOpen)}
                    className="btn-secondary btn-sm text-xs md:hidden"
                  >
                    Palette
                  </button>
                </div>

                {currentIdx < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentIdx(i => i + 1)}
                    className="btn-primary btn-sm flex items-center gap-2"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={submitting || subjectTransitioning}
                    className="btn-danger btn-sm flex items-center gap-2"
                  >
                    <Send size={14} /> Submit Exam
                  </button>
                )}
              </div>
            </main>

            {/* Question Palette Sidebar */}
            <aside className={`border-l border-slate-700/50 bg-slate-900/80 flex-shrink-0 transition-all duration-300 overflow-hidden ${paletteOpen ? 'w-56' : 'w-0'}`}>
              {paletteOpen && (
                <QuestionPalette
                  questions={questions}
                  answers={answers}
                  reviewList={reviewList}
                  currentIdx={currentIdx}
                  onJump={setCurrentIdx}
                />
              )}
            </aside>

            {/* Palette toggle for desktop */}
            <button
              onClick={() => setPaletteOpen(!paletteOpen)}
              className="absolute right-0 top-1/2 -translate-y-1/2 hidden md:flex w-5 h-16 bg-slate-800 border border-slate-700/50 rounded-l-lg items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              style={{ position: 'fixed', right: paletteOpen ? '224px' : '0' }}
            >
              {paletteOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
          </div>
        </>
      )}

      {/* ── Submit Confirm Modal ──────────────────────────────── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30">
                <Send size={22} className="text-orange-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Submit Exam?</h2>
                <p className="text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5 text-center">
              {[
                { label: 'Answered', value: Object.values(answers).filter(Boolean).length, color: 'text-emerald-400' },
                { label: 'This subject left', value: questions.filter(q => !answers[q._id?.toString()]).length, color: 'text-red-400' },
                { label: 'Marked', value: reviewList.length, color: 'text-amber-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {(questions.filter(q => !answers[q._id?.toString()]).length > 0 || Object.values(answers).filter(Boolean).length === 0) && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-4">
                <p className="text-amber-300 text-xs">
                  ⚠️ Some questions may still be unanswered across subjects. Submit will finalize the entire exam.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowSubmitConfirm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {submitting ? <><div className="spinner !w-4 !h-4 !border-t-white"></div> Submitting...</> : <><Send size={15} /> Submit Exam</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Violation Warning Modal ───────────────────────────── */}
      {showViolationWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-sm p-6 slide-up border border-red-500/40">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center border border-red-500/40 animate-pulse">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-400">Violation Detected!</h2>
                {examData?.enableAIProctoring ? (
                  <p className="text-slate-200 text-sm font-semibold mt-1">
                    Warning! Please keep looking at the screen. One more violation will automatically submit your exam.
                  </p>
                ) : (
                  <p className="text-slate-400 text-sm">{violationMsg}</p>
                )}
                {examData?.enableAIProctoring && (
                  <p className="text-slate-500 text-[10px] mt-1">Activity: {violationMsg}</p>
                )}
              </div>
            </div>

            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
              <p className="text-red-300 text-sm font-medium">
                {examData?.enableAIProctoring ? `Warning ${violations}/1` : `Warning ${violations}/${maxViolations}`}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                {examData?.enableAIProctoring
                  ? "One more violation will automatically submit your exam."
                  : `${maxViolations - violations} warning${maxViolations - violations !== 1 ? 's' : ''} remaining before auto-submission.`}
              </p>
            </div>

            <p className="text-slate-400 text-xs mb-4">
              Switching tabs, exiting fullscreen, or using keyboard shortcuts is not allowed during the exam.
            </p>

            <button
              onClick={() => {
                setShowViolationWarning(false)
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => { })
                }
              }}
              className="btn-primary w-full"
            >
              I Understand — Return to Exam
            </button>
          </div>
        </div>
      )}
      {/* ── AI Proctoring Component ────────────────────────────── */}
      {examData?.enableAIProctoring && (
        <AIProctor
          resultId={resultId}
          onViolation={triggerViolation}
          onPermissionChange={handlePermissionChange}
          retryTrigger={retryTrigger}
        />
      )}
    </div>
  )
}
