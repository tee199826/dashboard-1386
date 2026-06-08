import React from 'react'
import PeriodBadge from './PeriodBadge'

export function BigCard({ icon, label, value, pct, sub, color, period }) {
  const configs = {
    blue:    { gradient: 'from-blue-700 to-blue-500'        },
    emerald: { gradient: 'from-emerald-700 to-teal-500'     },
    rose:    { gradient: 'from-rose-700 to-rose-500'        },
    slate:   { gradient: 'from-slate-700 to-slate-500'      },
    amber:   { gradient: 'from-amber-600 to-orange-400'     },
  }
  const c = configs[color] || configs.blue
  return (
    <div className={`bg-gradient-to-br ${c.gradient} text-white rounded-2xl p-5 shadow-md hover:shadow-lg hover:opacity-95 transition-all duration-200 relative overflow-hidden`}>
      <div className="absolute -right-4 -bottom-4 opacity-[0.07] pointer-events-none select-none">
        {React.cloneElement(icon, { size: 88 })}
      </div>
      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-1.5 leading-tight">{label}</div>
      <div className="text-4xl font-bold leading-none">{(value || 0).toLocaleString()}</div>
      {pct && <div className="text-sm font-bold text-white/90 mt-1.5">{pct}</div>}
      {sub && <div className="text-xs text-white/55 mt-1 leading-tight">{sub}</div>}
      {period && <div className="mt-1.5 relative z-10"><PeriodBadge period={period} tone="dark" /></div>}
    </div>
  )
}

const SOURCE_THEMES = {
  'อินเตอร์เน็ต':  { icon: '🌐', gradient: 'from-blue-500 to-purple-600',   light: 'bg-blue-50',    text: 'text-blue-700' },
  'สายด่วน 1386':  { icon: '📞', gradient: 'from-emerald-500 to-teal-600',  light: 'bg-emerald-50', text: 'text-emerald-700' },
  'ทางรัฐ':        { icon: '🏛️', gradient: 'from-violet-400 to-purple-500', light: 'bg-violet-50',  text: 'text-violet-700' },
  'ช่องทางอื่นๆ':  { icon: '📋', gradient: 'from-orange-500 to-red-500',    light: 'bg-orange-50',  text: 'text-orange-700' },
}

const RANK_COLORS = {
  1: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white',
  2: 'bg-gradient-to-r from-slate-300 to-slate-400 text-white',
  3: 'bg-gradient-to-r from-orange-400 to-orange-500 text-white',
  4: 'bg-slate-100 text-slate-500',
}

export function SourceCard({ rank, channel, count, total, period }) {
  const theme = SOURCE_THEMES[channel] || SOURCE_THEMES['ช่องทางอื่นๆ']
  const rankColor = RANK_COLORS[rank] || 'bg-slate-100 text-slate-500'
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
  return (
    <div className="group bg-white border border-slate-100 rounded-2xl overflow-hidden hover:border-blue-200 hover:-translate-y-1 hover:shadow-lg transition-all duration-200 shadow-sm">
      <div className={`h-1.5 bg-gradient-to-r ${theme.gradient}`} />
      <div className="p-5">
        {/* Icon + Rank */}
        <div className="flex items-start justify-between mb-4">
          <div className={`w-14 h-14 ${theme.light} rounded-xl flex items-center justify-center text-3xl group-hover:scale-105 transition-transform duration-200`}>
            {theme.icon}
          </div>
          <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${rankColor}`}>
            #{rank}
          </div>
        </div>

        {/* Channel name */}
        <div className="text-sm text-slate-600 font-medium mb-1">{channel}</div>

        {/* Count */}
        <div className={`text-4xl font-extrabold ${theme.text} mb-3`}>
          {count.toLocaleString()}
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">สัดส่วน</span>
            <span className={`text-sm font-bold ${theme.text}`}>{pct}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className={`h-full bg-gradient-to-r ${theme.gradient} group-hover:opacity-90 transition-opacity duration-300`}
              style={{ width: `${Math.max(parseFloat(pct), 2)}%` }} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
          จาก {total.toLocaleString()} เรื่องร้องฯ
        </div>
        {period && <div className="mt-1.5"><PeriodBadge period={period} /></div>}
      </div>
    </div>
  )
}
