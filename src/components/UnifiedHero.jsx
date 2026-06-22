import { Calendar, Clock } from 'lucide-react'
import HeroActions from './HeroActions'

// shared dashboard hero — eyebrow + title + desc + period/upload chips + HeroActions (3 ปุ่ม)
const GRADIENT_MAP = {
  blue:   'from-blue-700 via-indigo-700 to-blue-800',
  indigo: 'from-indigo-700 via-blue-700 to-indigo-800',
  slate:  'from-slate-800 via-blue-900 to-slate-800',
  cyan:   'from-cyan-700 via-teal-800 to-cyan-700',
  amber:  'from-amber-700 via-orange-800 to-amber-700',
  violet: 'from-violet-700 via-purple-700 to-violet-800',
}

const CHIP = 'inline-flex items-center gap-1.5 text-xs text-white/90 bg-white/10 border border-white/20 rounded-full px-3 py-1'

export default function UnifiedHero({
  eyebrow, title, description,
  period = null, lastUpload = null,
  gradient = 'blue',
  sourceInfo, onRefresh, refreshing = false,
}) {
  return (
    <header className={`rounded-2xl px-8 py-6 mb-6 bg-gradient-to-r ${GRADIENT_MAP[gradient] || GRADIENT_MAP.blue} shadow-xl shadow-slate-900/20`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-xs uppercase tracking-widest text-white/70 mb-2">{eyebrow}</div>
          )}
          <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">{title}</h1>
          {description && <p className="text-white/90 mt-1 text-base">{description}</p>}

          {(period || lastUpload) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {period && (
                <span className={CHIP}><Calendar size={12} /> ข้อมูลช่วง {period}</span>
              )}
              {lastUpload && (
                <span className={CHIP}><Clock size={12} /> อัปล่าสุด {lastUpload}</span>
              )}
            </div>
          )}
        </div>

        <HeroActions sourceInfo={sourceInfo} onRefresh={onRefresh} refreshing={refreshing} />
      </div>
    </header>
  )
}
