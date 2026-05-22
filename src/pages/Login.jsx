import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Navigate } from 'react-router-dom'
import { Lock, Mail, Shield, AlertCircle, Loader2 } from 'lucide-react'

const BG_IMAGE_URL =
  'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=1920&q=80'

export default function Login() {
  const { user, signIn, isAdmin, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return null
  if (user && isAdmin) return <Navigate to="/admin/data" replace />
  if (user && !isAdmin) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
    } catch {
      setError('Email หรือ Password ไม่ถูกต้อง')
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ fontFamily: "'Sarabun', sans-serif" }}
    >
      {/* ── Background image ── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${BG_IMAGE_URL}')` }}
      />

      {/* ── Dark overlay ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(5,15,40,0.88) 0%, rgba(10,25,65,0.82) 40%, rgba(20,10,50,0.88) 100%)',
        }}
      />

      {/* ── Fine grid pattern ── */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,0.18) 40px,rgba(255,255,255,0.18) 41px),' +
            'repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,0.18) 40px,rgba(255,255,255,0.18) 41px)',
        }}
      />

      {/* ── Red accent glow – top-left ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-120px',
          left: '-80px',
          width: '480px',
          height: '480px',
          background:
            'radial-gradient(circle, rgba(180,20,40,0.30) 0%, transparent 70%)',
        }}
      />

      {/* ── Blue accent glow – bottom-right ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-100px',
          right: '-80px',
          width: '420px',
          height: '420px',
          background:
            'radial-gradient(circle, rgba(10,60,180,0.28) 0%, transparent 70%)',
        }}
      />

      {/* ── Watermark "1386" ── */}
      <div
        className="absolute select-none pointer-events-none text-white font-black leading-none"
        style={{
          left: '2rem',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '18vw',
          opacity: 0.055,
          letterSpacing: '-0.04em',
        }}
      >
        1386
      </div>

      {/* ── Thai flag stripes – right edge ── */}
      <div
        className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-none"
        style={{ opacity: 0.22 }}
      >
        {[
          { c: '#c4f646', h: 32 },
          { c: '#ffffff', h: 20 },
          { c: '#2457a5', h: 32 },
          { c: '#ffffff', h: 20 },
          { c: '#eeff00', h: 32 },
        ].map(({ c, h }, i) => (
          <div
            key={i}
            style={{ width: 5, height: h, background: c, borderRadius: 3 }}
          />
        ))}
      </div>

      {/* ════════════════════════════════
          CARD
      ════════════════════════════════ */}
      <div
        className="relative z-10 w-full mx-4"
        style={{ maxWidth: 400 }}
      >
        {/* Top accent bar */}
        <div
          className="h-1 w-full rounded-t-2xl"
          style={{
            background:
              'linear-gradient(90deg, #dc1e32 0%, #2457a5 50%, #dc1e32 100%)',
          }}
        />

        <div
          className="rounded-b-2xl px-10 py-9"
          style={{
            background: 'rgba(255,255,255,0.055)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderTop: 'none',
            boxShadow:
              '0 32px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          {/* ── Header ── */}
          <div className="flex flex-col items-center mb-8">
            {/* Emblem circle */}
            <div
              className="flex items-center justify-center mb-4"
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background:
                  'linear-gradient(145deg, #1a3a8f 0%, #0d2260 100%)',
                border: '3px solid rgba(254, 227, 71, 0.83)',
                boxShadow:
                  '0 0 0 1px rgba(255,215,0,0.15), 0 8px 28px rgba(0,0,80,0.5)',
              }}
            >
              <img
                src="/src/assets/logo-oncb.png"
                alt="ONCB Logo"
                style={{ width: 52, height: 52, objectFit: 'contain' }}
              />
            </div>

            {/* Org badge */}
            <span
              className="text-xs font-semibold tracking-widest uppercase mb-3 px-4 py-1 rounded-full"
              style={{
                background: 'rgba(36,87,165,0.25)',
                border: '1px solid rgba(100,150,255,0.30)',
                color: 'rgba(160,190,255,0.90)',
                letterSpacing: '0.18em',
              }}
            >
              สำนักงาน ป.ป.ส. กทม
            </span>

            <h1
              className="text-white text-xl font-semibold text-center mb-1"
              style={{ letterSpacing: '0.02em' }}
            >
              เข้าสู่ระบบจัดการฐานข้อมูล
            </h1>
            <p
              className="text-xs text-center"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              ระบบแสดงผลการดำเนินงานเรื่องร้องเรียนยาเสพติด&nbsp;1386
            </p>
          </div>

          {/* ── Divider ── */}
          <div
            className="mb-7"
            style={{
              height: '1px',
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
            }}
          />

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-semibold tracking-wider uppercase mb-2"
                style={{ color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em' }}
              >
                อีเมล
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="กรุณากรอกอีเมล"
                  className="w-full pl-10 pr-4 py-2.5 text-sm text-white rounded-lg outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    caretColor: '#7aadff',
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1px solid rgba(100,160,255,0.55)'
                    e.target.style.background = 'rgba(255,255,255,0.10)'
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1px solid rgba(255,255,255,0.12)'
                    e.target.style.background = 'rgba(255,255,255,0.07)'
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-xs font-semibold tracking-wider uppercase mb-2"
                style={{ color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em' }}
              >
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 text-sm text-white rounded-lg outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    caretColor: '#7aadff',
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1px solid rgba(100,160,255,0.55)'
                    e.target.style.background = 'rgba(255,255,255,0.10)'
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1px solid rgba(255,255,255,0.12)'
                    e.target.style.background = 'rgba(255,255,255,0.07)'
                  }}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg"
                style={{
                  background: 'rgba(220,30,50,0.12)',
                  border: '1px solid rgba(220,30,50,0.30)',
                  color: '#ff8a94',
                }}
              >
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-lg text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(135deg, #0f2d8a 0%, #1a4bc4 50%, #0f2d8a 100%)',
                backgroundSize: '200% 100%',
                border: '1px solid rgba(100,150,255,0.25)',
                boxShadow:
                  '0 4px 24px rgba(20,70,200,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
                letterSpacing: '0.05em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, #1a3faa 0%, #2557d8 50%, #1a3faa 100%)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, #0f2d8a 0%, #1a4bc4 50%, #0f2d8a 100%)'
              }}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>

          {/* ── Footer link ── */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')
              }
            >
              ← กลับหน้า Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}