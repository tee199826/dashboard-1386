import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogIn, Upload, Database, ScrollText, Users, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// โครงเมนูตาม mockup — section (หัวข้อใหญ่) → group (หัวข้อย่อย, label ไม่บังคับ) → item (ลิงก์)
// item ที่ไม่มี `to` = ยังไม่มีหน้า (soon) แสดงเป็นสีจางกดไม่ได้ ไม่ใช่ลิงก์ตาย
const NAV = [
  {
    title: 'สถานการณ์ยาเสพติด',
    groups: [
      { items: [
        { to: '/situation?section=incidents', label: 'ภาพรวม' },
        { to: '/situation?section=arrest', label: 'ข้อมูลการจับกุม' },
        { to: '/situation?section=treatment', label: 'ข้อมูลการบำบัด' },
        { to: '/radar', label: 'พิกัดยาเสพติด' },
      ] },
    ],
  },
  {
    title: 'เรื่องร้องเรียน 1386',
    groups: [
      { label: 'ผลการดำเนินการ', items: [
        { to: '/operations', label: 'ภาพรวม' },
        { to: '/bkn', label: 'ราย บก.น.' },
        { to: '/districts', label: 'รายเขต' },
      ] },
      { items: [{ to: '/complaints', label: 'การบันทึกข้อมูล' }] },
    ],
  },
  // หัวข้อใหญ่ที่กดเข้าหน้าได้เลย (ไม่มีเมนูย่อย) — titleTo
  {
    title: 'สร้างแผนที่',
    titleTo: '/pixel-map',
    groups: [],
  },
  {
    title: 'ฐานข้อมูลการข่าว',
    restricted: true,
    adminOnly: true, // ซ่อนทั้งหมวดถ้าไม่ใช่ผู้ดูแลระบบ
    note: 'เปิดสิทธิ์เฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต',
    groups: [
      { label: 'แบบซักผู้เสพ', items: [
        { to: '/substance-users', label: 'ข้อมูลการซักผู้เสพ' },
        { to: '/intel/interview', label: 'ค้นหา/รายการที่บันทึก' },
        { to: '/intel/interview/new', label: 'บันทึกข้อมูลผู้เสพ' },
      ] },
      { label: 'ราคายาเสพติด', items: [
        { label: 'แผนที่ราคายาเสพติด' },
        { label: 'บันทึกข้อมูล' },
      ] },
      { label: 'เป้าหมายบุคคล', items: [
        { label: 'ค้นหา' },
        { label: 'บันทึกข้อมูล' },
      ] },
    ],
  },
]

// active state ต้องดู query ด้วย — /situation ใช้ ?section= แยกแท็บ (ไม่มี query = แท็บ default 'arrest')
function useIsActive() {
  const { pathname, search } = useLocation()
  return (to) => {
    const [path, query] = to.split('?')
    if (pathname !== path) return false
    if (!query) return true
    const want = new URLSearchParams(query).get('section')
    const have = new URLSearchParams(search).get('section') || 'arrest'
    return want === have
  }
}

export default function PublicSidebar({ sidebarOpen, setSidebarOpen }) {
  const { user, profile, isAdmin } = useAuth()
  const { pathname } = useLocation()
  const isActive = useIsActive()
  const isSubstanceUsers = pathname.startsWith('/substance-users')
  const close = () => setSidebarOpen?.(false)

  const renderItem = (item, restricted) => {
    // ยังไม่มีหน้า — แสดงไว้ให้เห็นโครง แต่กดไม่ได้ (ไม่มีจุด = สัญลักษณ์ว่ากดไม่ได้ ; เว้นที่ให้ตรงแนวกับอันที่กดได้)
    if (!item.to) {
      return (
        <span key={item.label} title="อยู่ระหว่างพัฒนา"
          className="flex items-center gap-2 pl-6 pr-3 py-1.5 text-[13px] text-white/35 cursor-not-allowed select-none">
          <span className="w-1.5 shrink-0" />
          <span className="truncate">{item.label}</span>
        </span>
      )
    }
    const active = isActive(item.to)
    return (
      <Link key={item.to} to={item.to} onClick={close}
        className={`group flex items-center gap-2 pl-6 pr-3 py-1.5 rounded-lg text-[13px] transition ${
          active
            ? restricted
              ? 'bg-amber-300/25 text-amber-50 font-semibold'
              : 'bg-white/20 font-semibold'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-70 transition-transform group-hover:scale-150" />
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  const renderSection = (sec, i) => {
    const body = (
      <>
        {sec.title && (sec.titleTo ? (
          <Link to={sec.titleTo} onClick={close}
            className={`group flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold transition ${
              isActive(sec.titleTo) ? 'bg-white/20 text-white' : 'text-rose-300 hover:bg-white/10'
            }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-80 transition-transform group-hover:scale-150" />
            {sec.title}
          </Link>
        ) : (
          <div className={`px-3 pb-1 text-sm font-bold ${sec.restricted ? 'text-amber-200' : 'text-rose-300'}`}>
            {sec.title}
          </div>
        ))}
        {sec.groups.map((g, gi) => (
          <div key={g.label ?? `g${gi}`} className="space-y-0.5">
            {g.label && (
              <div className="pl-5 pr-3 py-1 text-[13px] font-semibold text-white/90">{g.label}</div>
            )}
            {g.items.map((it) => renderItem(it, sec.restricted))}
          </div>
        ))}
        {sec.note && (
          <div className="mt-2 pl-5 pr-3 flex items-start gap-1.5 text-[11px] leading-snug text-emerald-300/90">
            <Lock size={11} className="mt-0.5 shrink-0" /> {sec.note}
          </div>
        )}
      </>
    )
    // หมวดจำกัดสิทธิ์ — กรอบเหลืองตาม mockup
    return sec.restricted ? (
      <div key={i} className="rounded-xl border border-amber-300/30 bg-amber-300/10 py-2.5 space-y-0.5">{body}</div>
    ) : (
      <div key={i} className="space-y-0.5">{body}</div>
    )
  }

  const adminMenus = [
    { to: '/admin/data', icon: <Database size={16} />, label: 'จัดการข้อมูล' },
    { to: '/admin/logs', icon: <ScrollText size={16} />, label: 'ประวัติการใช้งาน' },
    { to: '/admin/users', icon: <Users size={16} />, label: 'ผู้ใช้งาน' },
  ]

  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gradient-to-b text-white flex-shrink-0 overflow-y-auto transform transition-transform duration-300 ${
      isSubstanceUsers ? 'from-purple-950 via-violet-900 to-purple-950' : 'from-slate-900 to-blue-900'
    } ${
      sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    }`}>

      {/* ผู้ใช้งาน */}
      <div className="px-3 pt-4 pb-3 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-widest text-blue-300/70">ชื่อ USER</div>
        <div className="mt-1 text-sm font-semibold truncate">
          {profile?.full_name || user?.email || 'ผู้ใช้งานทั่วไป'}
        </div>
        <div className="text-[11px] text-blue-200/80 truncate">{profile?.unit || 'วฝ.ปปส.กทม.'}</div>
      </div>

      <nav className="p-3 space-y-4">
        {NAV.filter((sec) => !sec.adminOnly || isAdmin).map(renderSection)}

        {isAdmin && (
          <div className="space-y-0.5 pt-1">
            <div className="px-3 pb-1 text-xs uppercase tracking-wide text-amber-300/80">👑 ผู้ดูแลระบบ</div>
            <NavLink to="/upload" onClick={close}
              className={({ isActive }) => `flex items-center gap-2.5 pl-5 pr-3 py-2 rounded-lg text-[13px] transition ${
                isActive ? 'bg-amber-500/20 text-amber-100 font-semibold' : 'hover:bg-white/10'
              }`}>
              <Upload size={16} /> นำเข้าข้อมูล
            </NavLink>
            {adminMenus.map((m) => (
              <NavLink key={m.to} to={m.to} onClick={close}
                className={({ isActive }) => `flex items-center gap-2.5 pl-5 pr-3 py-2 rounded-lg text-[13px] transition ${
                  isActive ? 'bg-amber-500/20 text-amber-100 font-semibold' : 'hover:bg-white/10'
                }`}>
                {m.icon} {m.label}
              </NavLink>
            ))}
          </div>
        )}

        {!user && (
          <div className="pt-3 border-t border-white/10">
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
