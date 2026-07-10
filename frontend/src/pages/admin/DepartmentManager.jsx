import { useEffect, useState } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react'

export default function DepartmentManager() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editDept, setEditDept] = useState(null)
  const [form, setForm] = useState({ name: '', code: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await api.get('/admin/departments')
      setDepartments(res.data.departments)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm({ name: '', code: '', description: '' }); setEditDept(null); setShowModal(true) }
  const openEdit = (d) => { setEditDept(d); setForm({ name: d.name, code: d.code, description: d.description }); setShowModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editDept) {
        await api.put(`/admin/departments/${editDept._id}`, form)
        toast.success('Department updated!')
      } else {
        await api.post('/admin/departments', form)
        toast.success('Department created!')
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
    if (!confirm('Deactivate this department?')) return
    try {
      await api.delete(`/admin/departments/${id}`)
      toast.success('Department deactivated')
      load()
    } catch {
      toast.error('Failed')
    }
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Departments</h1>
          <p className="text-slate-400 text-sm">{departments.length} departments</p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-sm flex items-center gap-2">
          <Plus size={16} /> Add Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12"><div className="spinner"></div></div>
        ) : departments.length === 0 ? (
          <div className="col-span-full glass-card p-12 text-center">
            <Building2 size={40} className="text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No departments yet. Add one to get started.</p>
          </div>
        ) : departments.map(d => (
          <div key={d._id} className="glass-card-hover p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                  <Building2 size={18} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100">{d.name}</h3>
                  <span className="badge badge-blue text-xs">{d.code}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(d)} className="btn-icon text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(d._id)} className="btn-icon text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
              </div>
            </div>
            {d.description && <p className="text-slate-500 text-xs mt-3">{d.description}</p>}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">{editDept ? 'Edit Department' : 'Add Department'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-icon text-slate-400 hover:text-slate-200 text-xl">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="input-label">Department Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field" placeholder="e.g. Computer Science and Engineering" required />
              </div>
              <div>
                <label className="input-label">Code *</label>
                <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="input-field" placeholder="e.g. CSE" required maxLength={10} />
              </div>
              <div>
                <label className="input-label">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field" rows={2} placeholder="Optional description..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <><div className="spinner !w-4 !h-4 !border-t-white"></div> Saving...</> : (editDept ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
