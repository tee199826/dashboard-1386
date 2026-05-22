import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute({ children }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-3">⛔</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
          <p className="text-sm text-slate-500 mb-5">เฉพาะผู้ดูแลระบบเท่านั้น</p>
          <a href="/" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm inline-block">← กลับหน้า Dashboard</a>
        </div>
      </div>
    )
  }

  return children
}
