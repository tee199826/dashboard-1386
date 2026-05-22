import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './context/DataContext'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Overview from './pages/Overview'
import AllDistricts from './pages/AllDistricts'
import DataTable from './pages/DataTable'
import Login from './pages/Login'
import AuditLogs from './pages/AuditLogs'
import UserManagement from './pages/UserManagement'
import Operations from './pages/Operations'
import PublicSidebar from './components/PublicSidebar'
import Header from './components/Header'
import SubstanceRadar from './pages/SubstanceRadar'

function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <div className="flex flex-1">
        <PublicSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/radar" element={<SubstanceRadar />} />

            <Route path="/" element={<MainLayout><Overview /></MainLayout>} />
            <Route path="/districts" element={<MainLayout><AllDistricts /></MainLayout>} />
            <Route path="/operations" element={<MainLayout><Operations /></MainLayout>} />

            <Route path="/admin/data" element={
              <ProtectedRoute><MainLayout><DataTable /></MainLayout></ProtectedRoute>
            } />
            <Route path="/admin/logs" element={
              <ProtectedRoute><MainLayout><AuditLogs /></MainLayout></ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute><MainLayout><UserManagement /></MainLayout></ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  )
}
