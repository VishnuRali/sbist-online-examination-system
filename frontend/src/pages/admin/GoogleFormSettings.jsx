import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { formatDateTime } from '../../utils/helpers'
import {
  Settings as SettingsIcon, CloudDownload, CheckCircle,
  XCircle, RefreshCw, Save, Edit3, AlertCircle
} from 'lucide-react'

export default function GoogleFormSettings() {
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [savedId, setSavedId] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Status and results
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [lastSyncResult, setLastSyncResult] = useState(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [syncSummary, setSyncSummary] = useState(null)

  const fetchSettingsAndStatus = async () => {
    try {
      // 1. Get current settings
      const settingsRes = await api.get('/admin/settings')
      if (settingsRes.data.settings) {
        const id = settingsRes.data.settings.googleSpreadsheetId || ''
        setSavedId(id)
        setSpreadsheetId(id)
        setIsEditing(!id) // Open input if no ID exists
      }

      // 2. Get sync status
      const statusRes = await api.get('/admin/sync-status')
      if (statusRes.data) {
        setLastSyncTime(statusRes.data.lastSyncTime)
        setLastSyncResult(statusRes.data.lastSyncResult)
        setIsConfigured(statusRes.data.isConfigured)
      }
    } catch (err) {
      toast.error('Failed to load Google sync settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettingsAndStatus()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!spreadsheetId.trim()) {
      toast.error('Spreadsheet ID cannot be empty')
      return
    }
    setSaving(true)
    try {
      await api.post('/admin/settings', { googleSpreadsheetId: spreadsheetId.trim() })
      setSavedId(spreadsheetId.trim())
      setIsEditing(false)
      toast.success('Google Sync settings saved successfully!')
      // Refresh status
      const statusRes = await api.get('/admin/sync-status')
      setIsConfigured(statusRes.data.isConfigured)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncSummary(null)
    try {
      const res = await api.post('/admin/sync-google-form')
      setSyncSummary(res.data)
      if (res.data.success) {
        toast.success(`Sync finished! ${res.data.created} new students registered.`)
        // Refresh status
        const statusRes = await api.get('/admin/sync-status')
        setLastSyncTime(statusRes.data.lastSyncTime)
        setLastSyncResult(statusRes.data.lastSyncResult)
      } else {
        toast.error(res.data.reason || 'Sync failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.reason || 'Sync failed due to server error')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="spinner mx-auto mb-3" />
        <p className="text-slate-400">Loading settings...</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
          <SettingsIcon size={24} className="text-blue-500" /> Google Sync Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure the Google Spreadsheet ID linked to your student registration form
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Settings Card */}
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-700/50 pb-2">
            <CloudDownload size={18} className="text-blue-400" /> Google Sheet Settings
          </h3>

          {!isEditing ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between bg-slate-800/60 rounded-xl p-4 border border-slate-700/30">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-medium">Saved Google Spreadsheet ID</p>
                  <code className="text-sm font-bold text-slate-200 block truncate max-w-md" title={savedId}>
                    {savedId}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-green flex items-center gap-1">
                    <CheckCircle size={10} /> Saved
                  </span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="btn-secondary btn-sm flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={13} /> Edit
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4 animate-fade-in">
              <div className="space-y-1.5">
                <label className="input-label">Google Spreadsheet ID</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 1a2b3c4d5e6f7g8h9i..."
                    value={spreadsheetId}
                    onChange={e => setSpreadsheetId(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary flex items-center justify-center gap-1.5 px-6 shrink-0 cursor-pointer"
                  >
                    {saving ? <div className="spinner !w-4 !h-4 !border-t-white" /> : <Save size={15} />}
                    Save Settings
                  </button>
                </div>
                {savedId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSpreadsheetId(savedId)
                      setIsEditing(false)
                    }}
                    className="text-xs text-slate-500 hover:text-slate-400 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Sync Operations Card */}
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-700/50 pb-2">
            <RefreshCw size={18} className="text-emerald-400" /> Sync Operations
          </h3>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/40 rounded-xl p-4 border border-slate-700/20">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-200">Manual Sync Execution</h4>
              <p className="text-xs text-slate-400">
                Trigger student ingestion from the configured spreadsheet. Sync runs on-demand only.
              </p>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
                <div>
                  Last Sync: <strong className="text-slate-300">{lastSyncTime ? formatDateTime(lastSyncTime) : 'Never'}</strong>
                </div>
                {isConfigured ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle size={10} /> Google API Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-500">
                    <AlertCircle size={10} /> Service Account Missing
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleSync}
              disabled={syncing || !savedId}
              className="btn-primary bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-none flex items-center justify-center gap-2 px-6 py-3 cursor-pointer shrink-0 disabled:opacity-40"
            >
              {syncing ? (
                <><RefreshCw className="animate-spin" size={16} /> Syncing...</>
              ) : (
                <><RefreshCw size={16} /> Sync Student Data</>
              )}
            </button>
          </div>

          {/* Sync Result Summary */}
          {(syncSummary || lastSyncResult) && (
            <div className="border border-slate-700/50 rounded-xl overflow-hidden mt-4 animate-fade-in">
              <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-700/50 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  {syncSummary ? 'Latest Sync Results' : 'Last Sync Summary'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {syncSummary ? 'Just now' : lastSyncTime ? formatDateTime(lastSyncTime) : ''}
                </span>
              </div>
              <div className="p-4 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'New Students Added', val: syncSummary ? syncSummary.created : lastSyncResult?.created || 0, color: 'text-emerald-400' },
                  { label: 'Existing Skipped', val: syncSummary ? syncSummary.skipped : lastSyncResult?.skipped || 0, color: 'text-slate-400' },
                  { label: 'Welcome Emails Sent', val: syncSummary ? syncSummary.emailsSent : lastSyncResult?.emailsSent || 0, color: 'text-blue-400' },
                  { label: 'Emails Failed', val: syncSummary ? syncSummary.emailsFailed : lastSyncResult?.emailsFailed || 0, color: 'text-red-400' }
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/40 text-center">
                    <p className={`text-xl font-bold ${color}`}>{val}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Sync Errors List */}
              {((syncSummary && syncSummary.errors && syncSummary.errors.length > 0) || (lastSyncResult && lastSyncResult.errors && lastSyncResult.errors.length > 0)) && (
                <div className="p-4 border-t border-slate-700/30 bg-red-500/5">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertCircle size={13} /> Sync Failures & Warnings
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono text-[11px] text-slate-400">
                    {(syncSummary?.errors || lastSyncResult?.errors || []).map((err, idx) => (
                      <div key={idx} className="bg-slate-950/50 p-2 rounded border border-red-500/10">
                        <span className="text-red-400 font-semibold">{err.email || err.rollNumber || 'Row'}:</span> {err.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
