import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Auth pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ForcePasswordChange from './pages/auth/ForcePasswordChange'

// Admin pages
import AdminLayout from './layouts/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import ExamManager from './pages/admin/ExamManager'
import StudentManager from './pages/admin/StudentManager'
import QuestionManager from './pages/admin/QuestionManager'
import ResultsManager from './pages/admin/ResultsManager'
import DepartmentManager from './pages/admin/DepartmentManager'
import SubjectManager from './pages/admin/SubjectManager'
import AdminManager from './pages/admin/AdminManager'
import EmailLogs from './pages/admin/EmailLogs'
import MailSettings from './pages/admin/MailSettings'
import LiveExamMonitor from './pages/admin/LiveExamMonitor'
import ErrorBoundary from './components/ErrorBoundary'

// Student pages
import StudentLayout from './layouts/StudentLayout'
import StudentDashboard from './pages/student/StudentDashboard'
import ExamPage from './pages/student/ExamPage'
import ResultPage from './pages/student/ResultPage'
import StudentProfile from './pages/student/StudentProfile'

// Protected route component
const ProtectedRoute = ({ children, requiredRole, isForcePasswordChangePage = false }) => {
  const { user, isLoading } = useAuth()

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="spinner mx-auto mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (user.role === 'student') {
    if (isForcePasswordChangePage) {
      if (user.isPasswordChanged) return <Navigate to="/student/dashboard" replace />
    } else if (!user.isPasswordChanged) {
      return <Navigate to="/student/force-password-change" replace />
    }
  }

  if (requiredRole) {
    const isAdmin = user.role === 'admin' || user.role === 'super_admin'
    // 'admin' required → allow both admin and super_admin
    if (requiredRole === 'admin' && isAdmin) return children
    // 'super_admin' required → only super_admin
    if (requiredRole === 'super_admin' && user.role !== 'super_admin') {
      return <Navigate to="/admin" replace />
    }
    // 'student' required
    if (requiredRole === 'student' && user.role !== 'student') {
      return <Navigate to={isAdmin ? '/admin' : '/login'} replace />
    }
  }

  return children
}


function App() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to={isAdmin ? '/admin' : '/student'} />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/student" />} />
      <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to={isAdmin ? '/admin' : '/student'} />} />

      {/* Force Password Change Guard Page */}
      <Route path="/student/force-password-change" element={
        <ProtectedRoute requiredRole="student" isForcePasswordChangePage={true}>
          <ForcePasswordChange />
        </ProtectedRoute>
      } />

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="admin">
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="exams" element={<ExamManager />} />
        <Route path="exams/:examId/questions" element={<QuestionManager />} />
        <Route path="students" element={<StudentManager />} />
        <Route path="results" element={<ResultsManager />} />
        <Route path="live-monitor" element={<ErrorBoundary><LiveExamMonitor /></ErrorBoundary>} />
        <Route path="departments" element={<DepartmentManager />} />
        <Route path="subjects" element={<SubjectManager />} />
        <Route path="admins" element={<AdminManager />} />
        <Route path="email-logs" element={<EmailLogs />} />
        <Route path="settings" element={
          <ProtectedRoute requiredRole="super_admin">
            <MailSettings />
          </ProtectedRoute>
        } />
      </Route>

      {/* Student routes */}
      <Route path="/student" element={
        <ProtectedRoute requiredRole="student">
          <StudentLayout />
        </ProtectedRoute>
      }>
        <Route index element={<StudentDashboard />} />
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="results" element={<ResultPage />} />
        <Route path="profile" element={<StudentProfile />} />
      </Route>

      {/* Exam (fullscreen, no layout) */}
      <Route path="/student/exam/:examId" element={
        <ProtectedRoute requiredRole="student">
          <ExamPage />
        </ProtectedRoute>
      } />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
