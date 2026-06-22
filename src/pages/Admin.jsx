/* global __BUILD_HASH__, __BUILD_DATE__ */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, RefreshCw, Upload, Download, Bug, Clock, Database, AlertTriangle,
  CalendarRange, BarChart3, FileText, Server, ArrowRight,
} from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchAllPages } from '../utils/supabasePagination'
import { formatThaiDate } from '../utils/heroMeta'
import { dateToFiscalYear } from '../utils/fiscalYear'

const BUILD_HASH = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''

// ── meta ต่อตาราง ──
const TABLES = [
  { id: 'drug_incidents',  emoji: '🎯', name: 'เหตุการณ์ยาเสพติด',     desc: 'เหตุการณ์ยาเสพติด (จับกุม/ตรวจค้น)', yearKind: 'date', yearCol: 'received_date' },
  { id: 'complaints',      emoji: '📞', name: 'เรื่องร้องเรียน 1386',    desc: 'เรื่องร้องเรียนผ่านสายด่วน 1386',     yearKind: 'date', yearCol: 'received_date' },
  { id: 'substance_users', emoji: '🧑', name: 'แบบเก็บข้อมูลผู้เสพ',     desc: 'แบบสำรวจข้อมูลผู้เสพ',               yearKind: 'fy',   yearCol: 'fiscal_year' },
  { id: 'bkn_summary',     emoji: '📊', name: 'สรุป บก.น. (RPT 115_B)',  desc: 'สรุปราย บก.น.',                     yearKind: 'unknown' },
  { id: 'report_114',      emoji: '📑', name: 'รายงาน RPT_114',          desc: 'ผลการดำเนินการตามร้องเรียน',         yearKind: 'fy',   yearCol: 'fiscal_year' },
]

const nowMs = () => Date.now()
function daysSince(iso) {
  if (!iso) return null
  const d = new Date(iso); if (isNaN(d)) return null
  return Math.max(0, Math.floor((nowMs() - d.getTime()) / 86400000))
}
const dayLabel = (n) => n == null ? '—' : n === 0 ? 'วันนี้' : `${n} วันก่อน`
const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10)

// status ตามความสด
function statusOf(days) {
  if (days == null) return { key: 'none',  label: 'ไม่มีประวัติ', dot: '⚪', bar: 'border-l-slate-300', text: 'text-slate-500', bg: 'bg-slate-100' }
  if (days <= 7)    return { key: 'fresh', label: 'fresh',        dot: '🟢', bar: 'border-l-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-100' }
  if (days <= 30)   return { key: 'aging', label: 'aging',        dot: '🟡', bar: 'border-l-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-100' }
  return              { key: 'stale', label: 'stale',        dot: '🔴', bar: 'border-l-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-100' }
}

// ── data hook ──
function useAdminData() {
  const [state, setState] = useState({ loading: true, error: null, counts: {}, batches: [], coverage: {}, refreshedAt: null })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      // 1) row counts ต่อตาราง
      const counts = {}
      await Promise.all(TABLES.map(async (t) => {
        const { count } = await supabase.from(t.id).select('*', { count: 'exact', head: true })
        counts[t.id] = count ?? null
      }))
      // 2) upload_batches ทั้งหมด (เล็ก ~45 row) → recent / last-upload / sparkline
      const { data: batches } = await supabase.from('upload_batches')
        .select('target_table, file_name, row_count, status, uploaded_at')
        .order('uploaded_at', { ascending: false })
      // 3) coverage ตาราง × ปีงบ
      const coverage = {}
      for (const t of TABLES) {
        if (t.yearKind === 'unknown') { coverage[t.id] = null; continue }
        const rows = await fetchAllPages(t.id, t.yearCol)
        const m = {}
        for (const r of rows) {
          const fy = t.yearKind === 'date' ? dateToFiscalYear(r[t.yearCol]) : (r[t.yearCol] || null)
          if (fy) m[fy] = (m[fy] || 0) + 1
        }
        coverage[t.id] = m
      }
      setState({ loading: false, error: null, counts, batches: batches || [], coverage, refreshedAt: new Date().toISOString() })
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message || String(err) }))
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

export default function Admin() {
  const navigate = useNavigate()
  const { loading, error, counts, batches, coverage, refreshedAt, reload } = useAdminData()

  // last upload + sparkline ต่อตาราง (จาก batches)
  const perTable = useMemo(() => {
    const out = {}
    const cutoff = nowMs() - 7 * 86400000
    for (const t of TABLES) {
      const own = batches.filter(b => b.target_table === t.id)
      const lastUpload = own[0]?.uploaded_at || null
      // sparkline: 7 วันล่าสุด รวม row_count/วัน
      const spark = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(nowMs() - (6 - i) * 86400000)
        return { day: dayKey(d.toISOString()), value: 0 }
      })
      const idx = Object.fromEntries(spark.map((s, i) => [s.day, i]))
      for (const b of own) {
        if (new Date(b.uploaded_at).getTime() < cutoff) continue
        const k = dayKey(b.uploaded_at)
        if (k in idx) spark[idx[k]].value += b.row_count || 0
      }
      out[t.id] = { lastUpload, spark }
    }
    return out
  }, [batches])

  const totalRows = useMemo(() => Object.values(counts).reduce((s, v) => s + (v || 0), 0), [counts])
  const lastUploadAll = batches[0]?.uploaded_at || null

  // coverage: ปีงบที่มีในทุกตาราง (union, sorted)
  const years = useMemo(() => {
    const s = new Set()
    for (const id in coverage) { if (coverage[id]) for (const y in coverage[id]) s.add(Number(y)) }
    return [...s].sort((a, b) => a - b)
  }, [coverage])

  // CSV snapshot
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['ตาราง', 'ชื่อ', 'row', 'อัปล่าสุด', 'วันก่อน', 'status']
    const lines = [head.map(esc).join(',')]
    for (const t of TABLES) {
      const lu = perTable[t.id]?.lastUpload
      const d = daysSince(lu)
      lines.push([t.id, t.name, counts[t.id] ?? '', formatThaiDate(lu) || '', d ?? '', statusOf(d).label].map(esc).join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'data-health-snapshot.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        {/* ── Hero (admin = slate) ── */}
        <div className="animate-rise relative overflow-hidden rounded-3xl px-8 py-9 text-white bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-xl shadow-slate-900/20">
          <div className="noise-overlay absolute inset-0 opacity-[0.1] mix-blend-overlay pointer-events-none" />
          <div className="dot-pattern absolute inset-0 text-white/10 opacity-30 pointer-events-none" />
          <div className="relative z-10">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/60 mb-2 flex items-center gap-1.5"><Settings size={13} /> ADMIN · DATA HEALTH</div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Data Health Dashboard</h1>
            <p className="text-base text-white/70 mt-2">สถานะข้อมูลทุกตาราง + ประวัติการอัปโหลด</p>
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <HeroChip icon={<Clock size={13} />}>อัปเดต {formatThaiDate(lastUploadAll) || '—'}</HeroChip>
              <HeroChip icon={<Database size={13} />}>{TABLES.length} ตาราง</HeroChip>
              <HeroChip icon={<BarChart3 size={13} />}>{totalRows.toLocaleString()} row</HeroChip>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} /> โหลดข้อมูลไม่สำเร็จ: {error}
            <button onClick={reload} className="ml-auto px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold">ลองอีกครั้ง</button>
          </div>
        )}

        {/* ── Section 1: Status Cards ── */}
        <Section emoji="🗂️" title="สถานะตารางข้อมูล">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {loading
              ? TABLES.map(t => <CardSkeleton key={t.id} />)
              : TABLES.map(t => (
                <StatusCard key={t.id} tbl={t} count={counts[t.id]} meta={perTable[t.id]} navigate={navigate} />
              ))}
          </div>
        </Section>

        {/* ── Section 2: Coverage Matrix ── */}
        <Section emoji="🧭" title="ความครบของข้อมูล (ตาราง × ปีงบ)">
          {loading ? <BlockSkeleton h="h-56" /> : <CoverageMatrix coverage={coverage} years={years} />}
        </Section>

        {/* ── Section 3: Upload History ── */}
        <Section emoji="🕐" title="ประวัติการอัปโหลด" id="upload-history">
          {loading ? <BlockSkeleton h="h-64" /> : <UploadHistory batches={batches.slice(0, 20)} />}
        </Section>

        {/* ── Section 4: Quick Actions ── */}
        <Section emoji="⚡" title="การทำงานด่วน">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionCard icon={<Upload />} label="ไปอัปข้อมูล" onClick={() => navigate('/upload')} />
            <ActionCard icon={<RefreshCw />} label="Refresh stats" onClick={reload} />
            <ActionCard icon={<Download />} label="ดาวน์โหลด CSV" onClick={exportCsv} />
            <ActionCard icon={<Bug />} label="ดู error log" onClick={() => document.getElementById('upload-history')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
        </Section>

        {/* ── Section 5: System Info ── */}
        <Section emoji="🖥️" title="ข้อมูลระบบ">
          <SystemInfo totalRows={totalRows} refreshedAt={refreshedAt} />
        </Section>
      </div>
    </div>
  )
}

function HeroChip({ icon, children }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-white/90 bg-white/10 backdrop-blur-md ring-1 ring-white/20 rounded-full px-3 py-1.5">{icon}{children}</span>
}

function Section({ emoji, title, id, children }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-violet-500 rounded-full" />
        <h2 className="text-xl font-semibold text-slate-800">{emoji} {title}</h2>
      </div>
      {children}
    </section>
  )
}

// ── Section 1: Status card ──
function StatusCard({ tbl, count, meta, navigate }) {
  const days = daysSince(meta?.lastUpload)
  const st = statusOf(days)
  const spark = meta?.spark || []
  return (
    <div className={`bg-white rounded-3xl ring-1 ring-slate-200 border-l-4 ${st.bar} shadow-sm hover:shadow-xl transition-shadow duration-300 p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-slate-900">{tbl.emoji} {tbl.name}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.dot} {st.label}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            <span className="font-mono">{tbl.id}</span> · <span className="tabular-nums font-semibold text-slate-700">{count != null ? count.toLocaleString() : '—'} row</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{tbl.desc}</div>
        </div>
      </div>
      <div className="text-xs text-slate-500 mt-3">
        อัปล่าสุด: {formatThaiDate(meta?.lastUpload) || '—'} · <span className={st.text}>{dayLabel(days)}</span>
      </div>
      {/* sparkline 7 วัน */}
      <div className="h-12 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11 }}
              formatter={(v) => [v.toLocaleString() + ' row', 'อัปโหลด']} labelFormatter={(l) => l} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {spark.map((s, i) => <Cell key={i} fill={s.value > 0 ? '#7c3aed' : '#e2e8f0'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-slate-400 -mt-1">อัปโหลด row/วัน (7 วันล่าสุด)</div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => navigate('/upload')} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-semibold hover:bg-violet-100 transition">
          ไปอัปข้อมูล <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Section 2: Coverage matrix ──
function coverageCell(count) {
  if (count == null) return { bg: 'bg-slate-100 text-slate-300', txt: '?' }   // unknown year
  if (count > 100)  return { bg: 'bg-emerald-500 text-white', txt: count.toLocaleString() }
  if (count >= 1)   return { bg: 'bg-amber-400 text-white',   txt: count.toLocaleString() }
  return              { bg: 'bg-slate-100 text-slate-300', txt: '—' }
}
function CoverageMatrix({ coverage, years }) {
  if (!years.length) return <div className="bg-white rounded-3xl ring-1 ring-slate-200 p-6 text-sm text-slate-400">ไม่มีข้อมูลปีงบ</div>
  return (
    <div className="bg-white rounded-3xl ring-1 ring-slate-200 shadow-sm p-5 overflow-auto">
      <table className="border-separate border-spacing-1 text-sm w-full">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-xs text-slate-400 font-medium">ตาราง \ ปีงบ</th>
            {years.map(y => <th key={y} className="px-2 py-1 text-xs text-slate-500 font-semibold text-center tabular-nums">{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {TABLES.map(t => {
            const cov = coverage[t.id]   // null = unknown
            return (
              <tr key={t.id}>
                <td className="px-2 py-1 text-slate-700 whitespace-nowrap">{t.emoji} {t.name}</td>
                {years.map(y => {
                  const count = cov == null ? null : (cov[y] || 0)
                  const c = coverageCell(count)
                  return (
                    <td key={y} title={`${t.name} ปีงบ ${y}: ${count == null ? 'ไม่ทราบปี' : count.toLocaleString() + ' row'}`}
                      className={`text-center rounded-lg text-xs font-semibold tabular-nums ${c.bg}`} style={{ minWidth: 48, height: 30 }}>
                      {c.txt}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> &gt;100 row</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> 1-100 row</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 ring-1 ring-slate-200" /> 0 row</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 ring-1 ring-slate-200 text-slate-300 text-[8px] flex items-center justify-center">?</span> ไม่ทราบปี (bkn_summary)</span>
      </div>
    </div>
  )
}

// ── Section 3: Upload history ──
const STATUS_TONE = {
  completed: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700', failed: 'bg-rose-50 text-rose-700',
}
function UploadHistory({ batches }) {
  if (!batches.length) return <div className="bg-white rounded-3xl ring-1 ring-slate-200 p-6 text-sm text-slate-400">ยังไม่มีประวัติการอัปโหลด</div>
  return (
    <div className="bg-white rounded-3xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-xs text-slate-500 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 font-semibold">เวลา</th>
              <th className="text-left px-4 py-2.5 font-semibold">ไฟล์</th>
              <th className="text-left px-4 py-2.5 font-semibold">ตาราง</th>
              <th className="text-right px-4 py-2.5 font-semibold">row</th>
              <th className="text-left px-4 py-2.5 font-semibold">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{formatThaiDate(b.uploaded_at)} · {dayLabel(daysSince(b.uploaded_at))}</td>
                <td className="px-4 py-2.5 text-slate-800 max-w-[240px] truncate" title={b.file_name}>{b.file_name}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{b.target_table}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-700">{(b.row_count ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[b.status] || 'bg-slate-100 text-slate-500'}`}>{b.status || '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Section 4: action card ──
function ActionCard({ icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className="group bg-white rounded-3xl ring-1 ring-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-5 flex flex-col items-center gap-2 text-center">
      <span className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
    </button>
  )
}

// ── Section 5: system info ──
function SystemInfo({ totalRows, refreshedAt }) {
  const SUPA = import.meta.env.VITE_SUPABASE_URL || ''
  const maskedUrl = SUPA.replace(/(https:\/\/\w{4})\w+(\.supabase\.co)/, '$1*****$2') || '—'
  const rows = [
    { icon: <Server size={15} />, label: 'Supabase URL', value: maskedUrl, mono: true },
    { icon: <FileText size={15} />, label: 'Build version', value: `${BUILD_HASH}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}`, mono: true },
    { icon: <Database size={15} />, label: 'Total rows (5 ตาราง)', value: totalRows.toLocaleString() },
    { icon: <CalendarRange size={15} />, label: 'Last data refresh', value: refreshedAt ? `${formatThaiDate(refreshedAt)} · ${new Date(refreshedAt).toLocaleTimeString('th-TH')}` : '—' },
  ]
  return (
    <div className="bg-white rounded-3xl ring-1 ring-slate-200 shadow-sm p-5 divide-y divide-slate-100">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 text-slate-500">{r.icon} {r.label}</span>
          <span className={`text-slate-800 text-right break-all ${r.mono ? 'font-mono text-xs' : 'font-semibold tabular-nums'}`}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── skeletons ──
function CardSkeleton() {
  return <div className="bg-white rounded-3xl ring-1 ring-slate-200 p-6 space-y-3">
    <div className="skeleton-shimmer h-5 w-2/3 rounded" />
    <div className="skeleton-shimmer h-3 w-1/2 rounded" />
    <div className="skeleton-shimmer h-12 w-full rounded mt-3" />
    <div className="skeleton-shimmer h-9 w-full rounded" />
  </div>
}
function BlockSkeleton({ h = 'h-40' }) {
  return <div className={`skeleton-shimmer ${h} w-full rounded-3xl`} />
}
