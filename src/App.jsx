import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './context/DataContext'
import { AuthProvider } from './context/AuthContext'
import { PresentationProvider, usePresentation } from './context/PresentationContext'
import { FilterProvider } from './context/FilterContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Overview from './pages/Overview'
import AllDistricts from './pages/AllDistricts'
import BehaviorTable from './pages/BehaviorTable'
import DataTable from './pages/DataTable'
import Login from './pages/Login'
import AuditLogs from './pages/AuditLogs'
import UserManagement from './pages/UserManagement'
import Operations from './pages/Operations'
import PublicSidebar from './components/PublicSidebar'
import Header from './components/Header'
import SubstanceRadar from './pages/SubstanceRadar'
import PixelMap from './pages/PixelMap'
import UploadPage from './pages/UploadPage'
import BknPage from './pages/BknPage'
import SubstanceUsers from './pages/SubstanceUsers'
import ComplaintsPage from './pages/ComplaintsPage'
import SituationPage from './pages/SituationPage'
import Admin from './pages/Admin'
import { Menu } from 'lucide-react'

function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isPresentation } = usePresentation()

  if (isPresentation) {
    return (
      <div className="h-screen bg-white flex flex-col overflow-hidden">
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <div className="flex flex-1 relative">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center">
          <Menu size={20} />
        </button>
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/40 z-30" />
        )}
        <PublicSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <PresentationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/radar" element={<MainLayout><SubstanceRadar /></MainLayout>} />
            <Route path="/pixel-map" element={<MainLayout><PixelMap /></MainLayout>} />

            <Route path="/" element={<MainLayout><FilterProvider><Overview /></FilterProvider></MainLayout>} />
            <Route path="/districts" element={<MainLayout><FilterProvider><AllDistricts /></FilterProvider></MainLayout>} />
            <Route path="/districts/behavior-table" element={<MainLayout><FilterProvider><BehaviorTable /></FilterProvider></MainLayout>} />
            <Route path="/operations" element={<MainLayout><FilterProvider><Operations /></FilterProvider></MainLayout>} />
            <Route path="/bkn" element={<MainLayout><FilterProvider><BknPage /></FilterProvider></MainLayout>} />
            <Route path="/substance-users" element={<MainLayout><FilterProvider><SubstanceUsers /></FilterProvider></MainLayout>} />
            <Route path="/complaints" element={<MainLayout><FilterProvider><ComplaintsPage /></FilterProvider></MainLayout>} />
            <Route path="/situation" element={<MainLayout><FilterProvider><SituationPage /></FilterProvider></MainLayout>} />

            {/* Admin · Data Health (public ก่อน — auth ทีหลัง) */}
            <Route path="/admin" element={<MainLayout><Admin /></MainLayout>} />

            <Route path="/upload" element={
              <ProtectedRoute><MainLayout><UploadPage /></MainLayout></ProtectedRoute>
            } />

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
        </PresentationProvider>
      </DataProvider>
    </AuthProvider>
  )
}
