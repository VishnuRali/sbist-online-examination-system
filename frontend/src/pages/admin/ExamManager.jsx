import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../utils/api'
import { formatDateTime, getStatusColor } from '../../utils/helpers'
import toast from 'react-hot-toast'
import {
  Plus, Edit2, Trash2, BookOpen,
  Calendar, Clock, AlertTriangle,
  List, Send, Layers, GripVertical, X, ChevronUp, ChevronDown
} from 'lucide-react'

const EMPTY_SUBJECT = {
  subjectName: '', subjectCode: '', duration: 60, totalMarks: 100, passMarks: 40, negativeMarking: false
}

const EMPTY_FORM = {
  title: '', examType: 'single', subject: '', department: '', semester: '1', year: '1', section: '',
  description: '', instructions: '', duration: 60, totalMarks: 100,
  passMarks: 40, startTime: '', endTime: '', randomizeQuestions: false,
  randomizeOptions: false, showResultAfterExam: true, allowDownloadResult: true,
  maxViolations: 3, negativeMarking: false,
  subjects: [],
}

const toLocalISOString = (dateInput) => {
  if (!dateInput) return ''
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + 'T' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes())
  )
}

const normalizeSectionValue = (section) => String(section || '').trim().toUpperCase()
const CONFLICT_STATUSES = new Set(['draft', 'scheduled', 'active'])

const getExamConflict = (candidate, existingExams, excludeExamId = null) => {
  const candidateSection = normalizeSectionValue(candidate.section)
  const candidateStart = new Date(candidate.startTime)
  const candidateEnd = new Date(candidate.endTime)
  if (!candidate.startTime || !candidate.endTime) return null
  if (isNaN(candidateStart.getTime()) || isNaN(candidateEnd.getTime())) return null

  return existingExams.find(exam => {
    if (excludeExamId && String(exam._id) === String(excludeExamId)) return false
    if (!CONFLICT_STATUSES.has(exam.status)) return false
    if (String(exam.department?._id || exam.department) !== String(candidate.department)) return false
    if (String(exam.year) !== String(candidate.year)) return false
    if (String(exam.semester) !== String(candidate.semester)) return false
    const examSection = normalizeSectionValue(exam.section)
    const sectionsOverlap = (candidateSection === '' || examSection === '' || candidateSection === examSection)
    if (!sectionsOverlap) return false
    const existingStart = new Date(exam.startTime)
    const existingEnd = new Date(exam.endTime)
    return candidateStart < existingEnd && candidateEnd > existingStart
  }) || null
}

// ─── Subject Editor Component ──────────────────────────────────────────────────
function SubjectEditor({ subjects, onChange }) {
  const [editIdx, setEditIdx] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_SUBJECT)

  const openAdd = () => { setEditIdx('new'); setEditForm({ ...EMPTY_SUBJECT }) }
  const openEdit = (i) => { setEditIdx(i); setEditForm({ ...subjects[i] }) }
  const closeEdit = () => setEditIdx(null)

  const saveSubject = () => {
    if (!editForm.subjectName.trim()) { toast.error('Subject name is required'); return }
    if (!editForm.duration || editForm.duration < 1) { toast.error('Duration must be at least 1 minute'); return }
    if (!editForm.totalMarks || editForm.totalMarks < 1) { toast.error('Total marks must be at least 1'); return }
    if (editForm.passMarks === '' || editForm.passMarks < 0) { toast.error('Pass marks must be 0 or more'); return }

    if (editIdx === 'new') {
      onChange([...subjects, { ...editForm, order: subjects.length }])
    } else {
      const updated = subjects.map((s, i) => i === editIdx ? { ...editForm, order: i } : s)
      onChange(updated)
    }
    closeEdit()
  }

  const removeSubject = (i) => {
    onChange(subjects.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })))
  }

  const moveUp = (i) => {
    if (i === 0) return
    const arr = [...subjects]
    ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
    onChange(arr.map((s, idx) => ({ ...s, order: idx })))
  }

  const moveDown = (i) => {
    if (i === subjects.length - 1) return
    const arr = [...subjects]
    ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
    onChange(arr.map((s, idx) => ({ ...s, order: idx })))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="input-label text-sm font-semibold text-blue-400">Subjects ({subjects.length})</label>
        <button type="button" onClick={openAdd} className="btn-primary btn-sm flex items-center gap-1 text-xs">
          <Plus size={12} /> Add Subject
        </button>
      </div>

      {subjects.length === 0 && (
        <div className="glass-card p-6 text-center border-dashed border-slate-600">
          <Layers size={28} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No subjects added yet</p>
          <p className="text-slate-600 text-xs mt-1">Add at least one subject (e.g. English, Coding, Aptitude)</p>
        </div>
      )}

      {subjects.map((s, i) => (
        <div key={i} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <button type="button" onClick={() => moveUp(i)} disabled={i === 0} className="text-slate-500 hover:text-slate-300 disabled:opacity-30">
              <ChevronUp size={14} />
            </button>
            <button type="button" onClick={() => moveDown(i)} disabled={i === subjects.length - 1} className="text-slate-500 hover:text-slate-300 disabled:opacity-30">
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-100 text-sm font-semibold">{s.subjectName} {s.subjectCode ? <span className="text-slate-500 font-normal">({s.subjectCode})</span> : ''}</p>
            <p className="text-slate-400 text-xs">{s.duration} min · {s.totalMarks} marks · Pass: {s.passMarks} {s.negativeMarking ? '· Negative marking' : ''}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => openEdit(i)} className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10">
              <Edit2 size={14} />
            </button>
            <button type="button" onClick={() => removeSubject(i)} className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}

      {subjects.length > 0 && (
        <div className="flex gap-4 text-xs text-slate-400 px-1">
          <span>Total Duration: <strong className="text-slate-200">{subjects.reduce((s, x) => s + Number(x.duration || 0), 0)} min</strong></span>
          <span>Total Marks: <strong className="text-slate-200">{subjects.reduce((s, x) => s + Number(x.totalMarks || 0), 0)}</strong></span>
          <span>Pass Marks: <strong className="text-slate-200">{subjects.reduce((s, x) => s + Number(x.passMarks || 0), 0)}</strong></span>
        </div>
      )}

      {/* Subject Edit Modal */}
      {editIdx !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="glass-card w-full max-w-md slide-up">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <h3 className="text-base font-bold text-slate-100">{editIdx === 'new' ? 'Add Subject' : 'Edit Subject'}</h3>
              <button type="button" onClick={closeEdit} className="btn-icon text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="input-label">Subject Name *</label>
                  <input value={editForm.subjectName} onChange={e => setEditForm(f => ({ ...f, subjectName: e.target.value }))}
                    className="input-field" placeholder="e.g. English, Coding, Aptitude" />
                </div>
                <div>
                  <label className="input-label">Subject Code</label>
                  <input value={editForm.subjectCode} onChange={e => setEditForm(f => ({ ...f, subjectCode: e.target.value }))}
                    className="input-field" placeholder="e.g. ENG" />
                </div>
                <div>
                  <label className="input-label">Duration (min) *</label>
                  <input type="number" value={editForm.duration} min={1}
                    onChange={e => setEditForm(f => ({ ...f, duration: parseInt(e.target.value) || 0 }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="input-label">Total Marks *</label>
                  <input type="number" value={editForm.totalMarks} min={1}
                    onChange={e => setEditForm(f => ({ ...f, totalMarks: parseInt(e.target.value) || 0 }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="input-label">Pass Marks *</label>
                  <input type="number" value={editForm.passMarks} min={0}
                    onChange={e => setEditForm(f => ({ ...f, passMarks: parseInt(e.target.value) || 0 }))}
                    className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${editForm.negativeMarking ? 'bg-red-600' : 'bg-slate-600'}`}
                      onClick={() => setEditForm(f => ({ ...f, negativeMarking: !f.negativeMarking }))}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editForm.negativeMarking ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs text-slate-300 font-medium">Negative Marking</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeEdit} className="btn-secondary flex-1">Cancel</button>
                <button type="button" onClick={saveSubject} className="btn-primary flex-1">
                  {editIdx === 'new' ? 'Add Subject' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ExamManager ─────────────────────────────────────────────────────────
export default function ExamManager() {
  const [exams, setExams] = useState([])
  const [subjects, setSubjects] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editExam, setEditExam] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const loadData = async () => {
    try {
      const [examRes, subjRes, deptRes] = await Promise.all([
        api.get('/exam'),
        api.get('/admin/subjects'),
        api.get('/admin/departments'),
      ])
      setExams(examRes.data.exams)
      setSubjects(subjRes.data.subjects)
      setDepartments(deptRes.data.departments)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openCreate = () => { setForm(EMPTY_FORM); setEditExam(null); setShowModal(true) }
  const openEdit = (exam) => {
    setEditExam(exam)
    setForm({
      ...exam,
      subject: exam.subject?._id || exam.subject || '',
      department: exam.department?._id || exam.department,
      startTime: toLocalISOString(exam.startTime),
      endTime: toLocalISOString(exam.endTime),
      subjects: exam.subjects || [],
      examType: exam.examType || 'single',
    })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()

    // Validate multi-subject
    if (form.examType === 'multi') {
      if (form.subjects.length === 0) {
        toast.error('Add at least one subject for a multi-subject exam')
        return
      }
    } else {
      if (!form.subject) {
        toast.error('Please select a subject')
        return
      }
    }

    // Client-side conflict check
    const conflictExam = getExamConflict(form, exams, editExam?._id)
    if (conflictExam) {
      toast.error(`Time conflict with "${conflictExam.title}" (same dept/year/sem/section).`, { id: 'exam-conflict' })
      return
    }

    setSaving(true)
    try {
      const payload = { ...form }
      // For multi-subject, compute totals from subjects
      if (payload.examType === 'multi' && payload.subjects.length > 0) {
        payload.totalMarks = payload.subjects.reduce((s, x) => s + Number(x.totalMarks || 0), 0)
        payload.passMarks = payload.subjects.reduce((s, x) => s + Number(x.passMarks || 0), 0)
        payload.duration = payload.subjects.reduce((s, x) => s + Number(x.duration || 0), 0)
      }

      if (editExam) {
        await api.put(`/exam/${editExam._id}`, payload)
        toast.success('Exam updated!', { id: 'exam-save' })
      } else {
        await api.post('/exam', payload)
        toast.success('Exam created!', { id: 'exam-save' })
      }
      setShowModal(false)
      loadData()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save exam', { id: 'exam-save-err' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this exam and all its questions?')) return
    setDeleting(id)
    try {
      await api.delete(`/exam/${id}`)
      toast.success('Exam deleted')
      loadData()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const handlePublish = async (id) => {
    try {
      await api.patch(`/exam/${id}/publish`)
      toast.success('Exam published!')
      loadData()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to publish')
    }
  }

  const statusBadge = (status) => (
    <span className={getStatusColor(status) + ' badge capitalize'}>{status}</span>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="spinner"></div>
    </div>
  )

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Exam Manager</h1>
          <p className="text-slate-400 text-sm">{exams.length} exams total</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 btn-sm">
          <Plus size={16} /> Create Exam
        </button>
      </div>

      {/* Exams list */}
      <div className="space-y-3">
        {exams.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <BookOpen size={40} className="text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg font-medium">No exams yet</p>
            <p className="text-slate-500 text-sm mb-6">Create your first exam to get started</p>
            <button onClick={openCreate} className="btn-primary btn-sm">Create Exam</button>
          </div>
        ) : exams.map(exam => (
          <div key={exam._id} className="glass-card p-5 hover:border-slate-600/50 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-base font-semibold text-slate-100 truncate">{exam.title}</h3>
                  {statusBadge(exam.status)}
                  {exam.examType === 'multi' && (
                    <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs">
                      Multi-Subject ({exam.subjects?.length || 0})
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                  {exam.examType === 'multi' ? (
                    <span className="flex items-center gap-1">
                      <Layers size={12} /> {exam.subjects?.map(s => s.subjectName).join(', ')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1"><BookOpen size={12} /> {exam.subject?.name}</span>
                  )}
                  <span className="flex items-center gap-1"><Clock size={12} /> {exam.duration} mins</span>
                  <span className="flex items-center gap-1"><Calendar size={12} /> {formatDateTime(exam.startTime)}</span>
                  <span className="flex items-center gap-1">📋 {exam.totalQuestions} Qs · {exam.totalMarks} Marks</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link to={`/admin/exams/${exam._id}/questions`} className="btn-secondary btn-sm flex items-center gap-1.5 text-xs">
                  <List size={13} /> Questions
                </Link>
                {exam.status === 'draft' && (
                  <button onClick={() => handlePublish(exam._id)} className="btn-success btn-sm flex items-center gap-1.5 text-xs">
                    <Send size={13} /> Publish
                  </button>
                )}
                <button onClick={() => openEdit(exam)} className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleDelete(exam._id)} disabled={deleting === exam._id}
                  className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                  {deleting === exam._id ? <div className="spinner !w-4 !h-4"></div> : <Trash2 size={16} />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-2xl max-h-[92vh] overflow-y-auto slide-up">
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-100">{editExam ? 'Edit Exam' : 'Create Exam'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-icon text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 text-xl">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">

              {/* Exam Type Toggle */}
              <div>
                <label className="input-label">Exam Type</label>
                <div className="flex gap-3 mt-1">
                  {[
                    { value: 'single', label: '📄 Single Subject', desc: 'One subject per exam' },
                    { value: 'multi', label: '📚 Multi Subject', desc: 'Multiple subjects in one exam' },
                  ].map(({ value, label, desc }) => (
                    <button key={value} type="button"
                      onClick={() => setForm(f => ({ ...f, examType: value }))}
                      className={`flex-1 py-3 px-4 rounded-xl border text-left transition-all ${
                        form.examType === value
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                          : 'border-slate-700/50 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                      }`}>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="input-label">Exam Title *</label>
                  <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="input-field" placeholder="e.g. Campus Placement Test 2025" required />
                </div>

                <div>
                  <label className="input-label">Department *</label>
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    className="input-field" required>
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>

                {form.examType === 'single' && (
                  <div>
                    <label className="input-label">Subject *</label>
                    <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      className="input-field">
                      <option value="">Select Subject</option>
                      {subjects.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="input-label">Year</label>
                  <select value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="input-field">
                    {['1','2','3','4'].map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>

                <div>
                  <label className="input-label">Semester</label>
                  <select value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))} className="input-field">
                    {['1','2','3','4','5','6','7','8'].map(s => <option key={s} value={s}>Semester {s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="input-label">Section <span className="text-slate-500 font-normal">(optional)</span></label>
                  <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} className="input-field">
                    <option value="">All Sections</option>
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </div>

                {form.examType === 'single' && (
                  <>
                    <div>
                      <label className="input-label">Duration (minutes) *</label>
                      <input type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) }))}
                        className="input-field" min={1} required />
                    </div>
                    <div>
                      <label className="input-label">Total Marks *</label>
                      <input type="number" value={form.totalMarks} onChange={e => setForm(f => ({ ...f, totalMarks: parseInt(e.target.value) }))}
                        className="input-field" min={1} required />
                    </div>
                    <div>
                      <label className="input-label">Pass Marks *</label>
                      <input type="number" value={form.passMarks} onChange={e => setForm(f => ({ ...f, passMarks: parseInt(e.target.value) }))}
                        className="input-field" min={0} required />
                    </div>
                  </>
                )}

                <div>
                  <label className="input-label">Max Violations</label>
                  <input type="number" value={form.maxViolations} onChange={e => setForm(f => ({ ...f, maxViolations: parseInt(e.target.value) }))}
                    className="input-field" min={1} max={10} />
                </div>

                <div>
                  <label className="input-label">Start Time *</label>
                  <input type="datetime-local" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="input-field" required />
                </div>

                <div>
                  <label className="input-label">End Time *</label>
                  <input type="datetime-local" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="input-field" required />
                </div>

                <div className="sm:col-span-2">
                  <label className="input-label">Instructions</label>
                  <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                    className="input-field" rows={3} placeholder="Enter exam instructions for students..." />
                </div>

                {/* Toggles */}
                <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'randomizeQuestions', label: 'Randomize Questions' },
                    { key: 'randomizeOptions', label: 'Randomize Options' },
                    { key: 'showResultAfterExam', label: 'Show Result' },
                    { key: 'allowDownloadResult', label: 'Allow Download' },
                    ...(form.examType === 'single' ? [{ key: 'negativeMarking', label: 'Negative Marking' }] : []),
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <div className={`relative w-10 h-5 rounded-full transition-colors ${form[key] ? 'bg-blue-600' : 'bg-slate-600'}`}
                        onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[key] ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                      </div>
                      <span className="text-xs text-slate-300 font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Multi-subject editor */}
              {form.examType === 'multi' && (
                <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-4">
                  <SubjectEditor
                    subjects={form.subjects}
                    onChange={(newSubjects) => setForm(f => ({ ...f, subjects: newSubjects }))}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <><div className="spinner !w-4 !h-4 !border-t-white"></div> Saving...</> : (editExam ? 'Update Exam' : 'Create Exam')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
