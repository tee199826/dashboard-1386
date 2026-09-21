import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearAllDrafts } from '../utils/interviewDraft'

const AuthContext = createContext(null)

// audit ตอน logout ไม่ควรค้าง signOut ไม่สิ้นสุด (SEC-10) — รอได้ไม่เกินเท่านี้แล้วออกจากระบบต่อ
const LOGOUT_AUDIT_TIMEOUT_MS = 3000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // generation ของการโหลด profile — ผลของคำขอเก่า (identity เปลี่ยนไปแล้ว/logout แล้ว) ถูกทิ้ง (SEC-08)
  const profileGen = useRef(0)
  const currentUserId = useRef(undefined)   // undefined = ยังไม่เคย apply session เลย

  // identity เปลี่ยน (login / switch user / logout) → ล้าง profile ทันที ไม่ให้สิทธิ์ของคนก่อนค้าง
  // แล้วค่อยโหลด profile ใหม่ ; อ่านไม่ได้ = ไม่มีสิทธิ์ (fail closed)
  // event ที่ identity เดิม (TOKEN_REFRESHED / SIGNED_IN ซ้ำตอนสลับแท็บ) ไม่ต้องโหลดซ้ำ — ยกเว้น force
  function applySession(session, { force = false } = {}) {
    const nextUser = session?.user || null
    const nextId = nextUser?.id ?? null
    if (!force && nextId === currentUserId.current) return
    currentUserId.current = nextId
    const gen = ++profileGen.current
    setUser(nextUser)
    setProfile(null)
    if (!nextUser) {
      // ไม่มี session แล้ว (กดออกจากระบบ / session หมดอายุ / ออกจากระบบจากแท็บอื่น)
      // → ลบร่างแบบซักผู้เสพที่ค้างในแท็บนี้ เพราะมีข้อมูลส่วนบุคคล
      clearAllDrafts()
      setLoading(false)
      return
    }
    setLoading(true)
    loadProfile(nextUser.id, gen)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) =>
      applySession(session, { force: event === 'USER_UPDATED' }))
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile(userId, gen) {
    const { data, error } = await supabase
      .from('profiles').select('id, email, full_name, role, created_at').eq('id', userId).single()
    if (gen !== profileGen.current) return   // มี identity ใหม่/ออกจากระบบไปแล้ว — ทิ้งผลนี้
    // apply เฉพาะ profile ของ user ปัจจุบันเท่านั้น ; error → คง null (ไม่มีสิทธิ์)
    setProfile(!error && data && data.id === userId ? data : null)
    if (error) console.warn('[auth] load profile failed:', error.message)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    setTimeout(() => logAction('login', null, null, { email }), 500)
    return data
  }

  async function signOut() {
    // profile/สิทธิ์ถูกล้างใน applySession ผ่าน onAuthStateChange(SIGNED_OUT) ; กัน audit ค้างด้วย timeout
    await Promise.race([
      logAction('logout', null, null, null),
      new Promise((resolve) => setTimeout(resolve, LOGOUT_AUDIT_TIMEOUT_MS)),
    ])
    await supabase.auth.signOut()
  }

  // audit ฝั่ง client — เป็นบันทึกเสริม (best-effort) ; การกระทำที่ต้องมีหลักฐานแน่นอน
  // (สร้าง/ดู PII/ส่งออก/ลบ แบบซัก, สร้างผู้ใช้) บันทึกฝั่งเซิร์ฟเวอร์ใน RPC/Edge Function แล้ว
  async function logAction(action, resource, resourceId, details) {
    const currentUser = (await supabase.auth.getUser()).data.user
    if (!currentUser) return false
    try {
      const { error } = await supabase.from('audit_logs').insert([{
        user_id: currentUser.id,
        user_email: currentUser.email,
        action,
        resource,
        resource_id: resourceId ? String(resourceId) : null,
        details: details || null,
        user_agent: navigator.userAgent,
      }])
      // supabase-js ไม่ throw — ต้องอ่าน .error เอง ไม่งั้น audit หายเงียบ (SEC-10)
      if (error) { console.warn('[audit] insert failed:', action, error.message); return false }
      return true
    } catch (err) {
      console.warn('[audit] insert failed:', action, err?.message || err)
      return false
    }
  }

  const isAdmin = profile?.role === 'admin' && profile?.id === user?.id

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signIn, signOut, logAction }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
