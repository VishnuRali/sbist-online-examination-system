export const formatDate = (date, options = {}) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric', ...options
  })
}

export const formatDateTime = (date) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

export const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

export const getStatusColor = (status) => {
  const colors = {
    active: 'badge-green',
    scheduled: 'badge-blue',
    draft: 'badge-gray',
    completed: 'badge-purple',
    cancelled: 'badge-red',
    in_progress: 'badge-yellow',
    submitted: 'badge-green',
    force_submitted: 'badge-red',
    auto_submitted: 'badge-yellow',
  }
  return colors[status] || 'badge-gray'
}

export const getGradeColor = (grade) => {
  const colors = { O: 'text-emerald-400', 'A+': 'text-green-400', A: 'text-blue-400', 
    'B+': 'text-indigo-400', B: 'text-yellow-400', C: 'text-orange-400', F: 'text-red-400' }
  return colors[grade] || 'text-slate-400'
}

export const truncate = (str, n) => str?.length > n ? str.substring(0, n) + '...' : str

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  document.body.removeChild(a)
}
