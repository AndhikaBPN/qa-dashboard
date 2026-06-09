import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import CoveragePage from '@/pages/CoveragePage'
import BugsPage from '@/pages/BugsPage'
import BugListPage from '@/pages/BugListPage'
import TestCasesPage from '@/pages/TestCasesPage'
import TestRunsPage from '@/pages/TestRunsPage'
import ReportsPage from '@/pages/ReportsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
                <Route path="/coverage" element={<CoveragePage />} />
                <Route path="/bugs" element={<BugsPage />} />
                <Route path="/bugs/:projectId" element={<BugListPage />} />
                <Route path="/test-cases" element={<TestCasesPage />} />
                <Route path="/test-runs" element={<TestRunsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
