import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  RefreshCw, MapPin, AlertTriangle,
} from 'lucide-react'
import IncidentMap from '../components/IncidentMap'
import BknSection1 from '../components/BknSection1'
import BknDrilldown from '../components/BknDrilldown'
import { getBknByDistrict, BKN_ORDER, BKN_COLORS } from '../utils/bknMapping'
import { fetchAllPages } from '../utils/supabasePagination'
import { enrichDrugRow } from '../utils/drugWide'
import { formatThaiDateShort as formatThaiDate } from '../utils/formatDate'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar, { PresentationEnterButton } from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'
import BknSummarySection from '../components/BknSummarySection'
import BknDrugStats from '../components/BknDrugStats'
import UnifiedHero from '../components/UnifiedHero'
import DateFilter from '../components/DateFilter'
import { formatThaiDate as fmtHeroDate } from '../utils/heroMeta'

const BKN_SOURCE_INFO = {
  title: 'แหล่งข้อมูล · รายงาน บก.น.',
  description: 'สถิติคดียาเสพติด รายงาน บก.น. 1-9',
  sources: ['bkn_summary (RPT_115_B)'],
}

export default function BknPage() {
  const { isPresentation } = usePresentation()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedBkn, setSelectedBkn] = useState(null)
  const [drilldownBkn, setDrilldownBkn] = useState(null)   // Phase 4: drill-down ระดับ สน.
  const [viewMode, setViewMode] = useState('point')
  const [lastUpload115B, setLastUpload115B] = useState(undefined)
  const [bannerPeriod, setBannerPeriod] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const all = await fetchAllPages('drug_incidents', '*')
      setIncidents(all.map(enrichDrugRow))  // wide one-hot → primary_drug/behaviors/primary_action
    } catch {
      setLoadError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── drill-down + URL state (?drilldown=4) → back/forward ใช้งานได้ ──
  const goDrilldown = useCallback((bkn) => {
    setDrilldownBkn(bkn)
    const url = new URL(window.location)
    const n = bkn ? String(bkn).replace(/\D+/g, '') : ''
    if (n) url.searchParams.set('drilldown', n); else url.searchParams.delete('drilldown')
    window.history.pushState({}, '', url)
  }, [])
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search).get('drilldown')
      setDrilldownBkn(p ? `บก.น.${p}` : null)
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    supabase.from('upload_batches')
      .select('uploaded_at')
      .eq('target_table', 'bkn_summary')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setLastUpload115B(data?.[0]?.uploaded_at ?? null))
  }, [])

  // แผนที่: จุดที่มีพิกัด · สีตาม บก.น. (แมปจาก district เพราะไม่มี police_station แล้ว)
  // กรองตาม บก.น. ที่เลือกจาก pill ใต้แผนที่
  const mapPoints = useMemo(() => {
    const pts = incidents.filter(r => r.lat && r.lng)
    return selectedBkn ? pts.filter(r => getBknByDistrict(r.district) === selectedBkn) : pts
  }, [incidents, selectedBkn])
  const getColor = useCallback(p => BKN_COLORS[getBknByDistrict(p.district)] || '#9ca3af', [])

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-14 h-14 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
      <p className="text-slate-600 font-semibold">กำลังโหลดข้อมูล...</p>
      <p className="text-xs text-slate-400 mt-1">กำลังดึงข้อมูลจากฐานข้อมูล</p>
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-red-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">ไม่สามารถโหลดข้อมูลได้</h2>
      <p className="text-sm text-slate-500 mb-4 text-center max-w-xs">{loadError}</p>
      <button onClick={load} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
        ลองอีกครั้ง
      </button>
    </div>
  )

  // ── DRILL-DOWN: มุมมองระดับ สน. ของ บก.น. ที่เลือก (Phase 4) ──
  if (drilldownBkn) return (
    <>
      {isPresentation && <PresentationBar title={`สน. ในสังกัด ${drilldownBkn}`} />}
      <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto'}>
        <BknDrilldown bkn={drilldownBkn} incidents={incidents} onBack={() => goDrilldown(null)} onSelect={goDrilldown} />
      </div>
    </>
  )

  return (
    <>
    {isPresentation && <PresentationBar title="รายงานความรวดเร็วการดำเนินการ บก.น." />}
    <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8'}>

      {/* ── OFFICIAL BANNER ── */}
      {!isPresentation && (
        <UnifiedHero
          gradient="slate"
          eyebrow="POLICE COMMAND · บก.น. 1-9"
          title="รายงาน บก.น."
          description="ความรวดเร็วการดำเนินการ · RPT 115_B"
          period={bannerPeriod}
          lastUpload={fmtHeroDate(lastUpload115B)}
          sourceInfo={BKN_SOURCE_INFO}
        />
      )}

      {/* DateFilter — read-only: bkn_summary มีงวดเดียว ยังกรองไม่ได้ */}
      {!isPresentation && (
        <div className="flex items-center gap-2 -mt-4">
          <DateFilter availableYears={[]} disabledModes={['fiscal', 'month', 'custom']} />
          <span className="text-xs text-slate-400">ข้อมูล บก.น. มีงวดเดียว · ยังไม่รองรับการกรอง</span>
        </div>
      )}

      <PresentationSlides isPresentation={isPresentation} normalClassName="max-w-[1600px] mx-auto space-y-8">

      {/* ── control bar ── */}
      {!isPresentation && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={load} disabled={loading} title="รีเฟรชข้อมูล"
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-300 shadow-sm transition">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <PresentationEnterButton />
        </div>
      )}

      {/* ── SECTION 1: ผลการดำเนินการตาม บก.น. (bkn_summary / RPT_115_B) ── */}
      <BknSection1
        onDrilldown={goDrilldown}
        onPeriodReady={setBannerPeriod}
        lastUpload={lastUpload115B ? formatThaiDate(lastUpload115B) : null}
        totalReceived={incidents.length}
      />

      {/* ── SECTION 2: สถิติเหตุการณ์ยาเสพติด (drug_incidents) ── */}
      <BknDrugStats incidents={incidents} onDrilldown={goDrilldown} />

      {/* ── SECTION 3: ตารางแยกตามกลุ่ม (heatmap + highlights) — single card ── */}
      <BknSummarySection />

      {/* ── MAP ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600" />
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <MapPin size={16} className="text-blue-600" /> แผนที่จุดเกิดเหตุ
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {mapPoints.length.toLocaleString()} จุดทั้งหมด · สีตาม บก.น.
              </p>
            </div>
            <div className="flex gap-2">
              {[['point', '● จุด'], ['heatmap', '🌡 Heatmap']].map(([m, l]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    viewMode === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedBkn(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                !selectedBkn ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>ทั้งหมด</button>
            {BKN_ORDER.filter(b => b !== 'ไม่ระบุ').map(b => (
              <button key={b} onClick={() => setSelectedBkn(selectedBkn === b ? null : b)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition"
                style={{
                  background: selectedBkn === b ? BKN_COLORS[b] : BKN_COLORS[b] + '15',
                  borderColor: selectedBkn === b ? BKN_COLORS[b] : BKN_COLORS[b] + '50',
                  color: selectedBkn === b ? '#fff' : BKN_COLORS[b],
                  opacity: selectedBkn && selectedBkn !== b ? 0.45 : 1,
                  outline: selectedBkn === b ? `2px solid ${BKN_COLORS[b]}` : 'none',
                  outlineOffset: 2,
                }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: selectedBkn === b ? '#fff' : BKN_COLORS[b] }} />
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[500px]">
          <IncidentMap
            className="w-full h-full"
            points={mapPoints}
            getColor={getColor}
            renderPopup={p => (
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: BKN_COLORS[getBknByDistrict(p.district)] || '#475569', marginBottom: 6 }}>
                  {getBknByDistrict(p.district)}
                </div>
                {[['เขต', p.district], ['แขวง', p.subdistrict], ['ยา', p.primary_drug], ['พฤติการณ์', p.behaviors]]
                  .filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
                      <span style={{ color: '#94a3b8', flexShrink: 0 }}>{l}</span>
                      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
              </div>
            )}
            tooltipText={p => `${getBknByDistrict(p.district)} · ${p.district || ''}`}
            viewMode={viewMode}
          />
        </div>
      </div>

      </PresentationSlides>

    </div>
    </>
  )
}
