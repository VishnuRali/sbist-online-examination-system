import { useEffect, useState } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, BookMarked } from 'lucide-react'

const YEARS = ['1', '2', '3', '4']
const SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8']

export default function SubjectManager() {
  const [subjects, setSubjects] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editSubj, setEditSubj] = useState(null)
  const [form, setForm] = useState({ name: '', code: '', department: '', semester: '1', year: '1', description: '' })
  const [saving, setSaving] = useState(false)
  const [filterDept, setFilterDept] = useState('')

  const load = async () => {
    try {
      const [subjRes, deptRes] = await Promise.all([
        api.get('/admin/subjects', { params: { department: filterDept } }),
        api.get('/admin/departments'),
      ])
      setSubjects(subjRes.data.subjects)
      setDepartments(deptRes.data.departments)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterDept])

  const openCreate = () => { setForm({ name: '', code: '', department: '', semester: '1', year: '1', description: '' }); setEditSubj(null); setShowModal(true) }
  const openEdit = (s) => {
    setEditSubj(s)
    setForm({ name: s.name, code: s.code, department: s.department?._id || s.department, semester: s.semester, year: s.year, description: s.description })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.department) return toast.error('Please select a department')
    setSaving(true)
    try {
      if (editSubj) {
        await api.put(`/admin/subjects/${editSubj._id}`, form)
        toast.success('Subject updated!')
      } else {
        await api.post('/admin/subjects', form)
        toast.success('Subject created!')
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
    if (!confirm('Deactivate this subject?')) return
    try {
      await api.delete(`/admin/subjects/${id}`)
      toast.success('Subject deactivated')
      load()
    } catch {
      toast.error('Failed')
    }
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Subjects</h1>
          <p className="text-slate-400 text-sm">{subjects.length} subjects</p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-sm flex items-center gap-2">
          <Plus size={16} /> Add Subject
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field w-56">
          <option value="">All Departments</option>
          {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject Name</th>
                <th>Department</th>
                <th>Year</th>
                <th>Semester</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8"><div className="spinner mx-auto"></div></td></tr>
              ) : subjects.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">No subjects found. Add one to get started.</td></tr>
              ) : subjects.map(s => (
                <tr key={s._id}>
                  <td><code className="badge badge-purple text-xs">{s.code}</code></td>
                  <td><span className="font-medium text-slate-200">{s.name}</span></td>
                  <td className="text-slate-400 text-sm">{s.department?.name}</td>
                  <td className="text-slate-400 text-sm">Year {s.year}</td>
                  <td className="text-slate-400 text-sm">Sem {s.semester}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(s)} className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(s._id)} className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">{editSubj ? 'Edit Subject' : 'Add Subject'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-icon text-slate-400 hover:text-slate-200 text-xl">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="input-label">Subject Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field" placeholder="e.g. Data Structures and Algorithms" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Code *</label>
                  <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="input-field" placeholder="e.g. CS301" required maxLength={10} />
                </div>
                <div>
                  <label className="input-label">Department *</label>
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="input-field" required>
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d._id} value={d._id}>{d.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Year *</label>
                  <select value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="input-field">
                    {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Semester *</label>
                  <select value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))} className="input-field">
                    {SEMESTERS.map(s => <option key={s} value={s}>Sem {s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="input-label">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field" placeholder="Optional description" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <><div className="spinner !w-4 !h-4 !border-t-white"></div> Saving...</> : (editSubj ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
