import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { Plus, Trash2, Edit2, Upload, Download, ArrowLeft, BookOpen, FileSpreadsheet, Layers } from 'lucide-react'

const EMPTY_Q = {
  questionText: '', options: { A: '', B: '', C: '', D: '' },
  correctAnswer: 'A', marks: 1, topic: '', difficulty: 'medium', subjectIndex: 0
}

export default function QuestionManager() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editQ, setEditQ] = useState(null)
  const [form, setForm] = useState(EMPTY_Q)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0)
  const fileRef = useRef()

  const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0

  const load = async () => {
    try {
      const [examRes, qRes] = await Promise.all([
        api.get(`/exam/${examId}`),
        api.get(`/exam/${examId}/questions`),
      ])
      setExam(examRes.data.exam)
      setQuestions(qRes.data.questions)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [examId])

  const currentQuestions = isMulti
    ? questions.filter(q => (q.subjectIndex || 0) === activeSubjectIdx)
    : questions

  const openCreate = () => {
    setForm({ ...EMPTY_Q, subjectIndex: isMulti ? activeSubjectIdx : 0 })
    setEditQ(null)
    setShowModal(true)
  }

  const openEdit = (q) => {
    setEditQ(q)
    setForm({ ...q })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editQ) {
        await api.put(`/exam/${examId}/questions/${editQ._id}`, form)
        toast.success('Question updated!')
      } else {
        await api.post(`/exam/${examId}/questions`, form)
        toast.success('Question added!')
      }
      setShowModal(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this question?')) return
    try {
      await api.delete(`/exam/${examId}/questions/${id}`)
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    if (isMulti) formData.append('subjectIndex', activeSubjectIdx)
    try {
      const res = await api.post(`/exam/${examId}/questions/bulk-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(res.data.message)
      if (res.data.errors?.length > 0) {
        res.data.errors.forEach(err => toast.error(err, { duration: 5000 }))
      }
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/exam/questions/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'question_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download template')
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-2 transition-colors">
            <ArrowLeft size={16} /> Back to Exams
          </button>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">{exam?.title}</h1>
          <p className="text-slate-400 text-sm">
            {questions.length} questions · {questions.reduce((s, q) => s + q.marks, 0)} total marks
            {isMulti && ` · ${exam.subjects.length} subjects`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate} className="btn-secondary btn-sm flex items-center gap-2 text-xs">
            <Download size={14} /> Template
          </button>
          <label className={`btn-warning btn-sm flex items-center gap-2 text-xs cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? <><div className="spinner !w-4 !h-4 !border-t-white"></div> Uploading...</> : <><FileSpreadsheet size={14} /> Upload Excel</>}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
          <button onClick={openCreate} className="btn-primary btn-sm flex items-center gap-2 text-xs">
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>

      {/* Multi-subject tabs */}
      {isMulti && (
        <div className="flex gap-2 flex-wrap">
          {exam.subjects.map((s, i) => {
            const count = questions.filter(q => (q.subjectIndex || 0) === i).length
            const marks = questions.filter(q => (q.subjectIndex || 0) === i).reduce((sum, q) => sum + q.marks, 0)
            return (
              <button key={i} onClick={() => setActiveSubjectIdx(i)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  activeSubjectIdx === i
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'bg-slate-800/50 border-slate-700/40 text-slate-400 hover:border-slate-600'
                }`}>
                <span className="font-semibold">{s.subjectName}</span>
                <span className="ml-2 text-xs opacity-70">{count}Q · {marks}M</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Current subject info for multi */}
      {isMulti && (
        <div className="glass-card p-4 flex items-center gap-4 text-sm">
          <div className="w-8 h-8 bg-purple-500/20 border border-purple-500/30 rounded-lg flex items-center justify-center">
            <Layers size={16} className="text-purple-400" />
          </div>
          <div>
            <p className="text-slate-200 font-semibold">{exam.subjects[activeSubjectIdx]?.subjectName}</p>
            <p className="text-slate-400 text-xs">
              {exam.subjects[activeSubjectIdx]?.duration} min ·
              {exam.subjects[activeSubjectIdx]?.totalMarks} marks ·
              Pass: {exam.subjects[activeSubjectIdx]?.passMarks}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-slate-200 font-semibold">{currentQuestions.length}</p>
            <p className="text-slate-400 text-xs">questions added</p>
          </div>
        </div>
      )}

      {/* Questions list */}
      {currentQuestions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <BookOpen size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg font-medium">No questions yet{isMulti ? ` for ${exam.subjects[activeSubjectIdx]?.subjectName}` : ''}</p>
          <p className="text-slate-500 text-sm mb-6">Add questions manually or upload from Excel</p>
          <div className="flex justify-center gap-3">
            <button onClick={openCreate} className="btn-primary btn-sm">Add Question</button>
            <button onClick={downloadTemplate} className="btn-secondary btn-sm">Download Template</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {currentQuestions.map((q, i) => (
            <div key={q._id} className="glass-card p-5 hover:border-slate-600/50 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0 border border-blue-500/30">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 font-medium mb-3">{q.questionText}</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {['A', 'B', 'C', 'D'].map(opt => (
                      <div key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                        q.correctAnswer === opt
                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800/50 border border-slate-700/30 text-slate-400'
                      }`}>
                        <span className="font-semibold w-5">{opt}.</span>
                        <span className="truncate">{q.options[opt]}</span>
                        {q.correctAnswer === opt && <span className="ml-auto text-emerald-400">✓</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>Marks: <strong className="text-slate-300">{q.marks}</strong></span>
                    {q.topic && <span>Topic: <strong className="text-slate-300">{q.topic}</strong></span>}
                    <span className={`capitalize ${q.difficulty === 'easy' ? 'text-green-400' : q.difficulty === 'hard' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {q.difficulty}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(q)} className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"><Edit2 size={15} /></button>
                  <button onClick={() => handleDelete(q._id)} className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Question Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto slide-up">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">{editQ ? 'Edit Question' : 'Add Question'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-icon text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 text-xl">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Subject selector for multi-subject */}
              {isMulti && (
                <div>
                  <label className="input-label">Subject *</label>
                  <select value={form.subjectIndex}
                    onChange={e => setForm(f => ({ ...f, subjectIndex: parseInt(e.target.value) }))}
                    className="input-field">
                    {exam.subjects.map((s, i) => (
                      <option key={i} value={i}>{s.subjectName}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="input-label">Question Text *</label>
                <textarea value={form.questionText} onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))}
                  className="input-field" rows={3} placeholder="Enter the question..." required />
              </div>

              {['A', 'B', 'C', 'D'].map(opt => (
                <div key={opt}>
                  <label className="input-label">Option {opt} *</label>
                  <input type="text" value={form.options[opt]}
                    onChange={e => setForm(f => ({ ...f, options: { ...f.options, [opt]: e.target.value } }))}
                    className="input-field" placeholder={`Option ${opt}`} required />
                </div>
              ))}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Correct Answer *</label>
                  <select value={form.correctAnswer} onChange={e => setForm(f => ({ ...f, correctAnswer: e.target.value }))} className="input-field">
                    {['A','B','C','D'].map(o => <option key={o} value={o}>Option {o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Marks *</label>
                  <input type="number" value={form.marks} onChange={e => setForm(f => ({ ...f, marks: parseFloat(e.target.value) }))}
                    className="input-field" min={0.5} step={0.5} required />
                </div>
                <div>
                  <label className="input-label">Difficulty</label>
                  <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className="input-field">
                    {['easy','medium','hard'].map(d => <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="input-label">Topic (optional)</label>
                <input type="text" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  className="input-field" placeholder="e.g. Data Structures" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <><div className="spinner !w-4 !h-4 !border-t-white"></div> Saving...</> : (editQ ? 'Update' : 'Add Question')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
