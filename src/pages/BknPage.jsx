import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { AlertTriangle } from 'lucide-react'
import IncidentMap from '../components/IncidentMap'
import BknSection1 from '../components/BknSection1'
import BknDrilldown from '../components/BknDrilldown'
import { getBknByDistrict, BKN_ORDER, BKN_COLORS } from '../utils/bknMapping'
import { fetchAllPages } from '../utils/supabasePagination'
import { enrichDrugRow } from '../utils/drugWide'
import { formatThaiDateShort as formatThaiDate } from '../utils/formatDate'
import { usePresentation } from '../context/PresentationContext'
import PresentationBar from '../components/PresentationBar'
import PresentationSlides from '../components/PresentationSlides'
import BknSummarySection from '../components/BknSummarySection'
import BknDrugStats from '../components/BknDrugStats'
import BknExecutiveHeader from '../components/BknExecutiveHeader'
import BknExecutiveSummary from '../components/BknExecutiveSummary'
import { formatThaiDate as fmtHeroDate, minMaxDate } from '../utils/heroMeta'
import { exportDrugIncidentReport } from '../utils/exportReport'
import ExportDialog from '../components/ExportDialog'

export default function BknPage() {
  const { isPresentation } = usePresentation()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedBkn, setSelectedBkn] = useState(null)
  const [drilldownBkn, setDrilldownBkn] = useState(null)   // Phase 4: drill-down ระดับ สน.
  const [viewMode, setViewMode] = useState('choropleth')
  const [lastUpload115B, setLastUpload115B] = useState(undefined)
  const [bannerPeriod, setBannerPeriod] = useState(null)
  const [dealerRows, setDealerRows] = useState([])

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
    fetchAllPages('substance_users', 'dealer_locations, surveyed_at').then(setDealerRows).catch(() => setDealerRows([]))
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

  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const handleExportConfirm = useCallback(async ({ mode, dateRange, zoneDetail, statusFilter }) => {
    setExporting(true)
    try {
      const scoped = selectedBkn ? incidents.filter(r => getBknByDistrict(r.district) === selectedBkn) : incidents
      const periodLabel = dateRange
        ? `กำหนดเอง (${fmtHeroDate(dateRange.from)} - ${fmtHeroDate(dateRange.to)})`
        : (bannerPeriod || 'ปีงบ 2569')
      await exportDrugIncidentReport({
        incidentRows: scoped,
        dealerRows,
        mode, dateRange, zoneDetail, statusFilter,
        periodLabel,
        filterLabel: `${selectedBkn || 'ทุก บก.น.'} · ทุกชนิดยา`,
        filenamePrefix: 'bkn-report',
      })
      setExportDialogOpen(false)
    } catch (err) {
      console.error('[/bkn] export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [incidents, selectedBkn, dealerRows, bannerPeriod])

  const incidentsDateRange = useMemo(() => minMaxDate(incidents, 'received_date'), [incidents])

  // ── CHOROPLETH: จำนวนเหตุการณ์รายเขต (slate sequential) — Phase 4 ──
  const normDist = d => {
    let s = String(d || '').replace(/^เขต\s*/, '')
    if (s === 'ราษฏร์บูรณะ') s = 'ราษฎร์บูรณะ'
    return s
  }
  const districtCounts = useMemo(() => {
    const src = selectedBkn ? incidents.filter(r => getBknByDistrict(r.district) === selectedBkn) : incidents
    const m = {}
    src.forEach(r => { if (r.district) { const d = normDist(r.district); m[d] = (m[d] || 0) + 1 } })
    return m
  }, [incidents, selectedBkn])
  const maxDistCount = useMemo(() => Math.max(1, ...Object.values(districtCounts)), [districtCounts])

  const choroStyle = useCallback(feature => {
    const c = districtCounts[normDist(feature.properties?.dname)] || 0
    const ratio = c / maxDistCount
    return {
      color: '#475569', weight: 1, opacity: 0.55,
      fillColor: '#0f172a', fillOpacity: c ? 0.10 + ratio * 0.62 : 0.03,
    }
  }, [districtCounts, maxDistCount])
  const choroEach = useCallback((feature, layer) => {
    const name = feature.properties?.dname || 'เขต'
    const c = districtCounts[normDist(name)] || 0
    const bkn = getBknByDistrict(name)
    layer.bindTooltip(
      `${name} · ${c.toLocaleString()} เรื่อง${bkn !== 'ไม่ระบุ' ? ' · ' + bkn : ''}`,
      { sticky: true, className: 'district-tooltip' })
  }, [districtCounts])

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
    <div className={isPresentation ? '' : 'p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 bg-[#fafaf9] min-h-screen'}>

      {/* ── EDITORIAL HEADER (single — แทน hero + DateFilter + control bar) ── */}
      {!isPresentation && (
        <BknExecutiveHeader
          period={bannerPeriod}
          lastUpload={fmtHeroDate(lastUpload115B)}
          onRefresh={load}
          refreshing={loading}
          onExport={() => setExportDialogOpen(true)}
        />
      )}
      <ExportDialog
        open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} onConfirm={handleExportConfirm}
        busy={exporting}
        currentPeriodLabel={bannerPeriod || 'ปีงบ 2569'}
        defaultFrom={incidentsDateRange.min ?? ''} defaultTo={incidentsDateRange.max ?? ''}
      />

      <PresentationSlides isPresentation={isPresentation} normalClassName="max-w-[1600px] mx-auto space-y-8">

      {/* ── EXECUTIVE SUMMARY (opening slide in presentation) ── */}
      <BknExecutiveSummary incidents={incidents} />

      {/* ── SECTION 1: ผลการดำเนินการตาม บก.น. (bkn_summary / RPT_115_B) ── */}
      <BknSection1
        onDrilldown={goDrilldown}
        onPeriodReady={setBannerPeriod}
        lastUpload={lastUpload115B ? formatThaiDate(lastUpload115B) : null}
      />

      {/* ── SECTION 2: สถิติเหตุการณ์ยาเสพติด (drug_incidents) ── */}
      <BknDrugStats incidents={incidents} onDrilldown={goDrilldown} />

      {/* ── SECTION 3: ตารางแยกตามกลุ่ม (heatmap + highlights) — single card ── */}
      <BknSummarySection />

      {/* ── MAP ── */}
      <div className="bg-white rounded-lg ring-1 ring-slate-200 overflow-hidden">
        <div className="p-6 md:p-8 pb-4 border-b border-slate-200">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">Geography</div>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {viewMode === 'choropleth' ? 'ความหนาแน่นรายเขต' : 'แผนที่จุดเกิดเหตุ'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {viewMode === 'choropleth'
                  ? 'เขตยิ่งเข้ม = เหตุการณ์ยิ่งมาก · คลิก บก.น. เพื่อกรอง'
                  : `${mapPoints.length.toLocaleString()} จุด · สีตาม บก.น.`}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {viewMode === 'choropleth' && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>น้อย</span>
                  <span className="flex gap-px">
                    {[0.08, 0.24, 0.42, 0.6, 0.72].map(o => (
                      <span key={o} className="w-4 h-3 rounded-sm" style={{ background: `rgba(15,23,42,${o})` }} />
                    ))}
                  </span>
                  <span>มาก</span>
                </div>
              )}
              <div className="flex gap-1 p-0.5 rounded-md ring-1 ring-slate-200 bg-slate-50">
                {[['choropleth', 'พื้นที่'], ['point', 'จุด']].map(([m, l]) => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                      viewMode === m ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedBkn(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ring-1 transition ${
                !selectedBkn ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'
              }`}>ทั้งหมด</button>
            {BKN_ORDER.filter(b => b !== 'ไม่ระบุ').map(b => {
              const on = selectedBkn === b
              return (
                <button key={b} onClick={() => setSelectedBkn(on ? null : b)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 transition ${
                    on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
                  } ${selectedBkn && !on ? 'opacity-50' : ''}`}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: on ? '#fff' : BKN_COLORS[b] }} />
                  {b}
                </button>
              )
            })}
          </div>
        </div>
        <div className="h-[500px]">
          <IncidentMap
            className="w-full h-full"
            points={viewMode === 'point' ? mapPoints : []}
            getColor={getColor}
            viewMode={viewMode === 'point' ? 'point' : 'none'}
            districtLayerKey={viewMode === 'choropleth' ? `choro-${selectedBkn || 'all'}-${incidents.length}` : ''}
            districtLayerStyle={viewMode === 'choropleth' ? choroStyle : null}
            districtLayerOnEachFeature={viewMode === 'choropleth' ? choroEach : null}
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
          />
        </div>
      </div>

      </PresentationSlides>

    </div>
    </>
  )
}
