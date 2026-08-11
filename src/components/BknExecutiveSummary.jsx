import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { buildBknInsights, fmt, pct1, stripKhet } from '../utils/bknInsights'

// Executive Summary — editorial headline + KPI band (4/3/3/2) + segment bar + URGENT/EXCELLENT ledger
// palette: slate + rose (urgent) + emerald (excellent) · ไม่มี gradient/สีจ้า/emoji
export default function BknExecutiveSummary({ incidents = [] }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.from('bkn_summary').select('bkn,total,done,pending,period')
      .eq('report_id', '115_B').limit(500)
      .then(({ data }) => setRows(data || []))
  }, [])

  const latestFy = useMemo(() => {
    let mx = null
    incidents.forEach(r => { if (r.fiscal_year && (mx === null || r.fiscal_year > mx)) mx = r.fiscal_year })
    return mx
  }, [incidents])

  const insight = useMemo(() => {
    if (!rows) return null
    const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort()
    const cur = periods[periods.length - 1] || null
    const prev = periods.length > 1 ? periods[periods.length - 2] : null
    return buildBknInsights({
      curRows: cur ? rows.filter(r => r.period === cur) : rows,
      prevRows: prev ? rows.filter(r => r.period === prev) : null,
      incidents, latestFy,
    })
  }, [rows, incidents, latestFy])

  if (!rows) return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 p-8 h-64 animate-pulse" />
  )
  if (!insight) return null

  const { headline, subhead, urgent, excellent, totals, spw, donePct, pendPct } = insight

  return (
    <section className="rounded-lg bg-white ring-1 ring-slate-200 p-8">
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
        Situation · ปีงบ 2569
      </div>

      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 leading-snug max-w-3xl">
        {headline}
      </h2>
      <p className="mt-2 text-sm text-slate-500">{subhead}</p>

      {/* ── KPI band 4 / 3 / 3 / 2 ── */}
      <div className="mt-8 pt-8 border-t border-slate-200 grid grid-cols-12 gap-y-6">
        <Metric span="sm:col-span-4" hero
          eyebrow="รับเข้าทั้งหมด · บก.น.1–9"
          value={fmt(totals.total)} unit="เรื่อง" />
        <Metric span="sm:col-span-3" divider accent="text-emerald-700"
          eyebrow="ดำเนินการแล้ว"
          value={fmt(totals.done)} unit="เรื่อง"
          sub={`${pct1(donePct)}% ของทั้งหมด`} />
        <Metric span="sm:col-span-3" divider accent="text-slate-900"
          eyebrow="คงค้าง"
          value={fmt(totals.pending)} unit="เรื่อง"
          sub={`${pct1(pendPct)}% ของทั้งหมด`} />
        <Metric span="sm:col-span-2" divider
          eyebrow="สปพ."
          value={fmt(spw.total)} unit="เรื่อง"
          sub={spw.total > 0 ? `เสร็จ ${fmt(spw.done)} · ค้าง ${fmt(spw.pending)}` : 'ไม่มีข้อมูล'} />
      </div>

      {/* ── segment bar (no gradient) ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-500 mb-2">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> ดำเนินการแล้ว {pct1(donePct)}%
          </span>
          <span className="flex items-center gap-1.5">
            คงค้าง {pct1(pendPct)}% <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          </span>
        </div>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100 gap-[2px]">
          <div className="h-full bg-emerald-600" style={{ width: `${donePct}%` }} />
          <div className="h-full bg-slate-400" style={{ width: `${pendPct}%` }} />
        </div>
      </div>

      {/* ── URGENT / EXCELLENT ledger ── */}
      <div className="mt-8 pt-8 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LedgerItem
          tone="rose"
          kicker="Urgent"
          name={urgent.name}
          metric={`ค้าง ${pct1(urgent.pendingPct)}%`}
          detail={urgent.district
            ? { district: urgent.district.district, pct: urgent.district.pct }
            : null}
          fallback={`ค้างสะสม ${fmt(urgent.pending)} จาก ${fmt(urgent.total)} เรื่อง`}
        />
        <LedgerItem
          tone="emerald"
          kicker="Excellent"
          name={excellent.name}
          metric={`เสร็จ ${pct1(excellent.donePct)}%`}
          detail={excellent.district
            ? { district: excellent.district.district, pct: excellent.district.pct }
            : null}
          fallback={`เสร็จ ${fmt(excellent.done)} จาก ${fmt(excellent.total)} เรื่อง`}
        />
      </div>
    </section>
  )
}

function Metric({ span, hero, divider, accent = 'text-slate-900', eyebrow, value, unit, sub }) {
  return (
    <div className={`col-span-12 ${span} ${divider ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}>
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500 leading-tight min-h-[28px]">
        {eyebrow}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`${hero ? 'text-6xl' : 'text-4xl'} font-semibold tracking-tight tabular-nums leading-none ${accent}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function LedgerItem({ tone, kicker, name, metric, detail, fallback }) {
  const accentBar = tone === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'
  const metricColor = tone === 'rose' ? 'text-rose-600' : 'text-emerald-600'
  return (
    <div className="relative rounded-lg ring-1 ring-slate-200 pl-5 pr-4 py-4">
      <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${accentBar}`} />
      <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{kicker}</div>
      <div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-lg font-semibold text-slate-900">{name}</span>
        <span className={`text-sm font-semibold tabular-nums ${metricColor}`}>{metric}</span>
      </div>
      {detail ? (
        <div className="mt-1 flex items-center justify-between gap-3 text-sm text-slate-500 flex-wrap">
          <span>{stripKhet(detail.district)}</span>
          <span className="tabular-nums">
            {detail.pct > 0 ? '↗ +' : '↘ '}{pct1(Math.abs(detail.pct))}% <span className="text-slate-400">mom</span>
          </span>
        </div>
      ) : (
        <div className="mt-1 text-sm text-slate-500">{fallback}</div>
      )}
    </div>
  )
}
