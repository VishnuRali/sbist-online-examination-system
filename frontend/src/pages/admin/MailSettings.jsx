import { useState, useEffect } from 'react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { 
  Settings as SettingsIcon, Mail, Globe, 
  CheckCircle, XCircle, RefreshCw, Save, ShieldAlert
} from 'lucide-react'

export default function MailSettings() {
  const [form, setForm] = useState({
    gmailUser: '',
    gmailAppPassword: '',
    examPortalUrl: 'http://localhost:5173'
  })
  
  const [recipientEmail, setRecipientEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/admin/settings')
        if (res.data.settings) {
          setForm({
            gmailUser: res.data.settings.gmailUser || '',
            gmailAppPassword: res.data.settings.gmailAppPassword || '',
            examPortalUrl: res.data.settings.examPortalUrl || 'http://localhost:5173'
          })
        }
      } catch (err) {
        toast.error('Failed to load mail settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/settings', form)
      toast.success('Configuration saved successfully!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post('/admin/settings/test', { ...form, recipientEmail })
      setTestResult(res.data)
      if (res.data.smtp?.success) {
        toast.success(recipientEmail ? 'Test email sent successfully!' : 'SMTP connection verified!')
      } else {
        const smtpReason = res.data.smtp?.reason ? `: ${res.data.smtp.reason}` : ''
        toast.error(`SMTP connection failed verification${smtpReason}.`)
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Testing connection failed.'
      toast.error(errMsg)
    } finally {
      setTesting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="spinner mx-auto mb-3" />
        <p className="text-slate-400">Loading configurations...</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl space-y-6 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
          <SettingsIcon size={24} className="text-indigo-500" /> Mail Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure Gmail SMTP credentials for automated student credentials emails
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-700/50 pb-2">
            <Mail size={18} className="text-indigo-400" /> Gmail SMTP Configuration
          </h3>

          <div className="space-y-4">
            <div>
              <label className="input-label">SMTP Username (Gmail Address)</label>
              <input
                type="email"
                className="input-field"
                placeholder="e.g. notifications@sbit.edu"
                value={form.gmailUser}
                onChange={e => setForm(p => ({ ...p, gmailUser: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="input-label">Gmail App Password (16 Characters)</label>
              <input
                type="password"
                className="input-field"
                placeholder="e.g. abcd efgh ijkl mnop"
                value={form.gmailAppPassword}
                onChange={e => setForm(p => ({ ...p, gmailAppPassword: e.target.value }))}
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Generate a 16-character App Password under your Google Account Security settings.
              </p>
            </div>

            <div>
              <label className="input-label flex items-center gap-1">
                <Globe size={13} className="text-slate-400" /> Exam Portal Base URL
              </label>
              <input
                type="url"
                className="input-field"
                placeholder="http://localhost:5173"
                value={form.examPortalUrl}
                onChange={e => setForm(p => ({ ...p, examPortalUrl: e.target.value }))}
                required
              />
            </div>

            <div className="border-t border-slate-700/50 pt-4">
              <label className="input-label">Test Recipient Email (Optional)</label>
              <input
                type="email"
                className="input-field"
                placeholder="Enter email to receive a real test message"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Providing a recipient email will send a verification message to verify complete inbox delivery.
              </p>
            </div>
          </div>
        </div>

        {/* Connection Test Results */}
        {testResult && (
          <div className="glass-card p-5 border border-slate-700/60 space-y-4">
            <div className="flex items-start gap-3">
              {testResult.smtp?.success ? (
                <CheckCircle className="text-emerald-400 mt-0.5" size={20} />
              ) : (
                <XCircle className="text-red-400 mt-0.5" size={20} />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-200">Gmail SMTP Connection Status</h4>
                {testResult.smtp?.success ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-400">SMTP Transport verified successfully.</p>
                    {testResult.smtp.response && (
                      <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/40 text-xs font-mono space-y-1 text-slate-300">
                        <p className="text-blue-400 font-bold">SMTP Server Response:</p>
                        <p>{testResult.smtp.response}</p>
                        {testResult.smtp.messageId && <p className="text-slate-500 text-[10px]">Message-ID: {testResult.smtp.messageId}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    <p className="text-xs text-red-400 font-medium">Failed to establish connection.</p>
                    
                    <div className="bg-red-500/5 rounded-xl p-3 border border-red-500/20 text-xs font-mono space-y-1 text-red-400 overflow-x-auto max-h-40">
                      <p className="font-bold">Error Message: {testResult.smtp.reason}</p>
                      {testResult.smtp.code && <p>SMTP Code: {testResult.smtp.code}</p>}
                      {testResult.smtp.command && <p>Last SMTP Command: {testResult.smtp.command}</p>}
                    </div>

                    {testResult.smtp.selfSignedIssue && (
                      <div className="bg-amber-500/10 rounded-xl p-3.5 border border-amber-500/30 text-xs text-amber-300 space-y-1.5 leading-relaxed">
                        <p className="font-bold flex items-center gap-1 text-amber-400">
                          ⚠️ Self-Signed Certificate Detected:
                        </p>
                        <p>
                          A local antivirus program, firewall, or proxy is intercepting secure TLS email traffic (common in Windows development setups).
                        </p>
                        <p className="font-semibold text-amber-200">
                          💡 Note: Node.js certificate validation has been dynamically relaxed in DEVELOPMENT mode only to allow testing. Production environments will enforce strict secure certificates.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="btn-secondary flex-center gap-2"
          >
            {testing ? <RefreshCw className="animate-spin" size={16} /> : <ShieldAlert size={16} />}
            Test Connection & Send Email
          </button>

          <button
            type="submit"
            disabled={saving || testing}
            className="btn-primary flex-center gap-2 px-6"
          >
            {saving ? <div className="spinner !w-4 !h-4 !border-t-white" /> : <Save size={16} />}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}
