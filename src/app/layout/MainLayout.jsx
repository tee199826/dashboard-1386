import { useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { usePresentation } from '../../shared/state/contexts.js'
import PublicSidebar from './PublicSidebar.jsx'
import Header from './Header.jsx'
import { Menu } from 'lucide-react'

// โครง tree เดียวทั้ง 2 โหมด — presentation แค่ซ่อน Header/Sidebar
// (ถ้า return tree คนละชุด React จะ remount children → state ของหน้า/FilterProvider หายตอนเข้า-ออกโหมดนำเสนอ)
export function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isPresentation } = usePresentation()

  return (
    <div className={isPresentation ? 'h-screen bg-white flex flex-col overflow-hidden' : 'min-h-screen bg-slate-50 flex flex-col'}>
      {!isPresentation && <Header />}
      <div className={isPresentation ? 'flex flex-1 min-h-0' : 'flex flex-1 relative'}>
        {!isPresentation && (
          <>
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
          </>
        )}
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

// Reset scroll only when the path changes; preserve in-page query navigation.
export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
