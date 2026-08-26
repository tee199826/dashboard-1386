import { NavLink, useLocation } from 'react-router-dom'
import { BarChart3, MapPin, LogIn, Database, ScrollText, Users, FileSpreadsheet, Map, Upload, Shield, UserSearch, Palette, FileWarning, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function PublicSidebar({ sidebarOpen, setSidebarOpen }) {
  const { user, isAdmin } = useAuth()
  const { pathname } = useLocation()
  const isSubstanceUsers = pathname.startsWith('/substance-users')

  const close = () => setSidebarOpen?.(false)

  // เมนูสาธารณะจัดเป็นหมวด — section=null = ไม่มีหัวข้อ (หน้าแรก)
  const publicGroups = [
    { section: null, items: [
      { to: '/', icon: <BarChart3 size={18} />, label: 'ภาพรวม' },
    ] },
    { section: 'สถิติ & รายงาน', items: [
      { to: '/districts', icon: <MapPin size={18} />, label: 'รายเขต' },
      { to: '/situation', icon: <Activity size={18} />, label: 'สถานการณ์ยาเสพติด' },
      { to: '/bkn', icon: <Shield size={18} />, label: 'สถิติ บก.น.' },
    ] },
    { section: 'ข้อมูล & บันทึก', items: [
      { to: '/complaints', icon: <FileWarning size={18} />, label: 'เรื่องร้องเรียน' },
      { to: '/operations', icon: <FileSpreadsheet size={18} />, label: 'ผลการดำเนินงาน' },
      { to: '/substance-users', icon: <UserSearch size={18} />, label: 'ผลเก็บข้อมูลจากผู้เสพติด' },
    ] },
    { section: 'แผนที่', items: [
      { to: '/radar', icon: <Map size={18} />, label: 'แผนที่ยาเสพติด' },
      { to: '/pixel-map', icon: <Palette size={18} />, label: 'สร้างแผนที่' },
    ] },
  ]

  const renderItem = (m) => (
    <NavLink key={m.to} to={m.to} end={m.to === '/'} onClick={close}
      className={({ isActive }) => {
        const base = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition '
        // active state พิเศษเฉพาะ /substance-users (violet glow ตาม theme) — หน้าอื่นคงเดิม
        if (isActive && m.to === '/substance-users')
          return base + 'bg-violet-500/30 text-white font-semibold shadow-lg shadow-violet-500/30 border-l-4 border-violet-300'
        return base + (isActive ? 'bg-white/20 font-semibold' : 'hover:bg-white/10')
      }}>
      {m.icon} {m.label}
    </NavLink>
  )

  const adminMenus = [
    { to: '/admin/data', icon: <Database size={18} />, label: 'จัดการข้อมูล' },
    { to: '/admin/logs', icon: <ScrollText size={18} />, label: 'ประวัติการใช้งาน' },
    { to: '/admin/users', icon: <Users size={18} />, label: 'ผู้ใช้งาน' },
  ]

  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gradient-to-b text-white flex-shrink-0 overflow-y-auto transform transition-transform duration-300 ${
      isSubstanceUsers ? 'from-purple-950 via-violet-900 to-purple-950' : 'from-slate-900 to-blue-900'
    } ${
      sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    }`}>

      <nav className="p-3 space-y-1">
        {publicGroups.map((g, gi) => (
          <div key={g.section ?? 'home'} className={`space-y-1 ${gi > 0 ? 'pt-2' : ''}`}>
            {g.section && (
              <div className={`px-3 py-1 text-xs uppercase tracking-wide ${isSubstanceUsers ? 'text-violet-300/70' : 'text-blue-300/70'}`}>{g.section}</div>
            )}
            {g.items.map(renderItem)}
          </div>
        ))}

        {isAdmin && (
          <>
            <div className="px-3 py-1 mt-4 text-xs text-amber-300/80 uppercase tracking-wide">👑 ผู้ดูแลระบบ</div>
            <NavLink to="/upload" onClick={close}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                isActive ? 'bg-amber-500/20 text-amber-100 font-semibold' : 'hover:bg-white/10'
              }`}>
              <Upload size={18} /> นำเข้าข้อมูล
            </NavLink>
            {adminMenus.map(m => (
              <NavLink key={m.to} to={m.to} onClick={close}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive ? 'bg-amber-500/20 text-amber-100 font-semibold' : 'hover:bg-white/10'
                }`}>
                {m.icon} {m.label}
              </NavLink>
            ))}
          </>
        )}

        {!user && (
          <div className="pt-4 mt-4 border-t border-white/10">
            <NavLink to="/login" onClick={close}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 transition">
              <LogIn size={18} /> เข้าสู่ระบบ
            </NavLink>
          </div>
        )}
      </nav>
    </aside>
  )
}
