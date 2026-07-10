import { useNavigate } from 'react-router-dom'
import { GraduationCap, AlertTriangle, ArrowLeft } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="college-header py-8 px-6 text-center relative">
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center border border-white/25 shadow-xl">
            <GraduationCap size={32} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white font-['Outfit']">
          SWARNA BHARATHI INSTITUTE
        </h1>
        <p className="text-lg font-semibold text-white/80 font-['Outfit']">OF SCIENCE AND TECHNOLOGY</p>
        <p className="text-blue-200 text-sm mt-1">Online Examination Portal</p>
      </div>

      {/* Notice Card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md fade-in">
          <div className="glass-card p-8 text-center space-y-6">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-amber-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100 font-['Outfit']">Registration Disabled</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Direct student registration via the exam portal website is not permitted.
              </p>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50 text-left space-y-3">
              <p className="text-xs text-slate-300 font-semibold uppercase tracking-wider">How to Register:</p>
              <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2">
                <li>Fill out and submit the official SBIST Google Registration Form.</li>
                <li>The system will automatically process your response.</li>
                <li>Your secure login credentials will be emailed to you immediately.</li>
              </ol>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} /> Back to Login
            </button>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center">
        <p className="text-slate-600 text-xs">
          © {new Date().getFullYear()} Swarna Bharathi Institute of Science and Technology
        </p>
      </footer>
    </div>
  )
}
