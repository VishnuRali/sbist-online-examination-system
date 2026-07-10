import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext'
import {
  Users, BookOpen, GraduationCap, BarChart2, TrendingUp, Activity,
  Award, Target, CheckCircle, Clock, Calendar, Mail, MailX,
  ShieldCheck, BookMarked, Trophy
} from 'lucide-react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement, PointElement, LineElement, Filler
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
  ArcElement, PointElement, LineElement, Filler
)

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: 'rgba(71,85,105,0.5)',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
    },
  },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(71,85,105,0.2)' } },
    y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(71,85,105,0.2)' } },
  },
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/dashboard')
        setData(res.data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="spinner mx-auto mb-3" />
        <p className="text-slate-400">Loading dashboard...</p>
      </div>
    </div>
  )

  const s = data?.stats || {}

  const statCards = [
    {
      label: 'Total Students', value: s.totalStudents ?? 0,
      icon: Users, color: 'from-blue-500 to-indigo-600',
      bg: 'bg-blue-500/10', border: 'border-blue-500/20',
    },
    {
      label: 'Active Students', value: s.activeStudents ?? 0,
      icon: ShieldCheck, color: 'from-emerald-500 to-green-600',
      bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',
    },
    {
      label: 'Online Students', value: s.onlineStudents ?? 0,
      icon: Activity, color: 'from-teal-500 to-emerald-500',
      bg: 'bg-teal-500/10', border: 'border-teal-500/20', pulse: true,
    },
    {
      label: 'Total Exams', value: s.totalExams ?? 0,
      icon: BookOpen, color: 'from-purple-500 to-violet-600',
      bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    },
    {
      label: 'Running Exams', value: s.runningExams ?? 0,
      icon: BookMarked, color: 'from-cyan-500 to-blue-500',
      bg: 'bg-cyan-500/10', border: 'border-cyan-500/20',
    },
    {
      label: 'Upcoming Exams', value: s.upcomingExams ?? 0,
      icon: Calendar, color: 'from-indigo-500 to-violet-600',
      bg: 'bg-indigo-500/10', border: 'border-indigo-500/20',
    },
    {
      label: 'Completed Exams', value: s.completedExams ?? 0,
      icon: CheckCircle, color: 'from-slate-500 to-slate-600',
      bg: 'bg-slate-500/10', border: 'border-slate-500/20',
    },
    {
      label: 'Published Results', value: s.publishedResults ?? 0,
      icon: Trophy, color: 'from-rose-500 to-pink-500',
      bg: 'bg-rose-500/10', border: 'border-rose-500/20',
    },
    {
      label: 'Departments', value: s.departmentsCount ?? 0,
      icon: GraduationCap, color: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-500/10', border: 'border-amber-500/20',
    },
    {
      label: 'Subjects', value: s.subjectsCount ?? 0,
      icon: Target, color: 'from-orange-500 to-red-500',
      bg: 'bg-orange-500/10', border: 'border-orange-500/20',
    },
  ]

  const examBarData = {
    labels: data?.examStats?.map(e => (e.title?.length > 14 ? e.title.substring(0, 14) + '…' : e.title)) || [],
    datasets: [
      {
        label: 'Avg Marks',
        data: data?.examStats?.map(e => e.avgMarks?.toFixed(1)) || [],
        backgroundColor: 'rgba(59,130,246,0.7)',
        borderColor: '#3b82f6', borderWidth: 2, borderRadius: 6,
      },
      {
        label: 'Students',
        data: data?.examStats?.map(e => e.count) || [],
        backgroundColor: 'rgba(99,102,241,0.7)',
        borderColor: '#6366f1', borderWidth: 2, borderRadius: 6,
      },
    ],
  }

  const monthlyData = data?.monthlyRegistrations || []
  const lineData = {
    labels: monthlyData.map(m => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return `${months[m._id.month - 1]} ${m._id.year}`
    }),
    datasets: [{
      label: 'New Students',
      data: monthlyData.map(m => m.count),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      borderWidth: 2, fill: true, tension: 0.4,
      pointBackgroundColor: '#6366f1', pointRadius: 5,
    }],
  }

  const resultDoughnut = {
    labels: ['Passed', 'Failed'],
    datasets: [{
      data: [
        Math.round((parseFloat(s.passPercentage) / 100) * (s.totalResults || 0)),
        Math.round(((100 - parseFloat(s.passPercentage)) / 100) * (s.totalResults || 0)),
      ],
      backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)'],
      borderColor: ['#10b981', '#ef4444'], borderWidth: 2,
    }],
  }

  const recentActivity = data?.recentActivity || []

  return (
    <div className="space-y-6 fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-['Outfit']">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Welcome back, <span className="text-blue-400 font-medium">{user?.name}</span>! Here's what's happening today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-sm text-emerald-400 font-medium">{s.onlineStudents ?? 0} online</span>
          </div>
          {s.emailFailed > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-xl border border-red-500/20">
              <MailX size={14} className="text-red-400" />
              <span className="text-sm text-red-400 font-medium">{s.emailFailed} email failures</span>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards — 5 per row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg, border, pulse }) => (
          <div key={label} className={`glass-card p-5 border ${border} hover:scale-[1.02] transition-transform duration-200`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1 leading-tight">{label}</p>
                <p className="text-2xl font-bold text-slate-100 font-['Outfit'] tabular-nums">{value}</p>
              </div>
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center relative border ${border} bg-gradient-to-br ${color}`}>
                <Icon size={18} className="text-white" />
                {pulse && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Exam Performance Bar */}
        <div className="lg:col-span-2 glass-card p-6">
          <h3 className="text-base font-semibold text-slate-200 mb-4 font-['Outfit']">Exam Performance</h3>
          <div className="h-56">
            {data?.examStats?.length > 0 ? (
              <Bar data={examBarData} options={chartDefaults} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                <BookOpen size={32} className="text-slate-700" />
                <p>No exam data yet — create and publish exams to see performance</p>
              </div>
            )}
          </div>
        </div>

        {/* Pass/Fail doughnut */}
        <div className="glass-card p-6">
          <h3 className="text-base font-semibold text-slate-200 mb-4 font-['Outfit']">Pass / Fail</h3>
          <div className="h-48">
            {s.totalResults > 0 ? (
              <Doughnut data={resultDoughnut} options={{ ...chartDefaults, scales: undefined, cutout: '70%' }} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No results yet</div>
            )}
          </div>
          {s.totalResults > 0 && (
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-3 h-3 rounded-full bg-emerald-500" /> Pass ({s.passPercentage}%)
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-3 h-3 rounded-full bg-red-500" /> Fail
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Registrations */}
        <div className="lg:col-span-2 glass-card p-6">
          <h3 className="text-base font-semibold text-slate-200 mb-4 font-['Outfit']">Monthly Student Registrations</h3>
          <div className="h-48">
            {monthlyData.length > 0 ? (
              <Line data={lineData} options={chartDefaults} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                <Users size={32} className="text-slate-700" />
                <p>No registration data — students registered via Google Form will appear here</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-card p-6 flex flex-col">
          <h3 className="text-base font-semibold text-slate-200 mb-4 font-['Outfit']">Recent Activity</h3>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-52">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2 py-6">
                <Activity size={28} className="text-slate-700" />
                <p>No recent activity</p>
              </div>
            ) : recentActivity.map((r, i) => (
              <div key={r._id || i} className="flex items-center gap-3 py-2 border-b border-slate-700/40 last:border-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.isPassed ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-xs font-medium truncate">{r.student?.name || '—'}</p>
                  <p className="text-slate-500 text-xs truncate">{r.exam?.title || '—'}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-xs font-bold ${r.isPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.obtainedMarks}/{r.totalMarks}
                  </p>
                  <p className="text-slate-600 text-xs">{r.isPassed ? 'PASS' : 'FAIL'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="glass-card p-6">
        <h3 className="text-base font-semibold text-slate-200 mb-4 font-['Outfit']">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Create Exam', to: '/admin/exams', icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'View Students', to: '/admin/students', icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'View Results', to: '/admin/results', icon: Award, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Email Logs', to: '/admin/email-logs', icon: Mail, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
          ].map(({ label, to, icon: Icon, color, bg }) => (
            <Link key={label} to={to} className={`flex items-center gap-3 p-4 rounded-xl border ${bg} hover:scale-[1.03] transition-all duration-200`}>
              <Icon size={20} className={color} />
              <span className="text-sm font-medium text-slate-300">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
