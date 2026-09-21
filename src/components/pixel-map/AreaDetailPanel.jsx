// AreaDetailPanel — การ์ดสรุปพื้นที่ที่เมาส์ชี้อยู่บนแผนที่
// อยู่ข้างแผนที่ (ไม่ใช่ tooltip ลอยตามเมาส์) จึงอ่านได้สบาย ไม่บังแผนที่ และค้างไว้ที่พื้นที่ล่าสุดให้อ่านต่อได้
// ตัวเลขทั้งหมดมาจากข้อมูลเหตุการณ์ยาเสพติดตามช่วงเวลาที่เลือก (ชุดเดียวกับ tooltip บนแผนที่)
import { useMemo } from 'react'
import { MousePointerClick, X } from 'lucide-react'
import { nodeDetail, communityList, resolveAreaNode } from '../../utils/pixelMapData'
import { BEHAVIOR_COLORS } from '../../utils/constants'

const LEVEL_LABEL = { district: 'เขต', subdistrict: 'แขวง', community: 'ชุมชน' }

const areaTitle = (a) => (a.level === 'subdistrict' && !a.label.startsWith('แขวง') ? `แขวง${a.label}` : a.label)

// แถบบนสุดของแผง — มีพื้นที่ที่คลิกเลือกไว้: บอกชื่อ + ปุ่มยกเลิก (เห็นตลอดแม้กำลังชี้พื้นที่อื่นอยู่) ; ไม่มี: บอกวิธีเลือก
function PinBar({ pinnedArea, onClearPin, comparing }) {
  if (!pinnedArea) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-slate-400">
        <MousePointerClick size={13} className="shrink-0" />
        {comparing ? 'คลิกพื้นที่ในแต่ละแผนที่ แล้วดูตารางเทียบใต้แผนที่' : 'คลิกพื้นที่บนแผนที่เพื่อเลือกไว้'}
      </p>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-lg bg-cyan-50 ring-1 ring-cyan-200 px-2.5 py-1.5 text-[12.5px] text-cyan-800">
        <MousePointerClick size={14} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate">เลือกไว้: <b className="font-semibold">{areaTitle(pinnedArea)}</b></span>
        <button type="button" onClick={onClearPin} title="ยกเลิกการเลือก"
          className="shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-medium hover:bg-cyan-100">
          <X size={12} /> ยกเลิก
        </button>
      </div>
      {/* โหมด compare เท่านั้นที่เทียบข้ามแผนที่ได้ — ตารางเทียบอยู่ใต้แผนที่ (แผงนี้แสดงพื้นที่เดียว) */}
      {comparing && <p className="text-[11.5px] text-slate-400">คลิกพื้นที่ในแผนที่อื่นเพื่อเทียบ — ดูตารางเทียบใต้แผนที่</p>}
    </div>
  )
}
const IN_COLOR = '#f43f5e'  // ในชุมชน — สีเดียวกับพื้นที่ชุมชนบนแผนที่
const OUT_COLOR = '#94a3b8'
const TOP_COMMUNITIES = 5

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11.5px] font-semibold tracking-wide text-slate-500">{children}</span>
      {right && <span className="text-[11.5px] text-slate-400 tabular-nums">{right}</span>}
    </div>
  )
}

function LegendRow({ color, label, value, total }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 text-slate-600">{label}</span>
      <span className="tabular-nums font-bold text-slate-900">{value.toLocaleString()}</span>
      <span className="w-10 text-right tabular-nums text-slate-400">{pct(value, total)}%</span>
    </div>
  )
}

export default function AreaDetailPanel({ area, pinnedArea, onClearPin, hierarchy, periodLabel = 'ทุกปี', comparing = false }) {
  const detail = useMemo(() => nodeDetail(resolveAreaNode(hierarchy, area)), [area, hierarchy])
  const communities = useMemo(() => (
    area && area.level !== 'community'
      ? communityList(hierarchy, area.dname, area.level === 'subdistrict' ? area.label : null)
      : []
  ), [area, hierarchy])

  if (!area || !detail) {
    return (
      <div className="space-y-2">
        <PinBar pinnedArea={pinnedArea} onClearPin={onClearPin} comparing={comparing} />
        <p className="text-[13px] leading-relaxed text-slate-400">ชี้เมาส์หรือคลิกที่เขต / แขวง / ชุมชน บนแผนที่ แล้วรายละเอียดจะขึ้นตรงนี้</p>
      </div>
    )
  }

  const { count, inCommunity, outCommunity, behaviors } = detail
  const maxBehavior = behaviors.length ? Math.max(...behaviors.map(b => b.n)) : 0
  const restCommunities = Math.max(0, communities.length - TOP_COMMUNITIES)

  return (
    <div className="space-y-3.5">
      <PinBar pinnedArea={pinnedArea} onClearPin={onClearPin} comparing={comparing} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-violet-600">{LEVEL_LABEL[area.level] ?? ''}</div>
          <div className="text-base font-bold text-slate-900 leading-snug break-words">
            {area.label.replace(/^(เขต|แขวง|ชุมชน)\s*/, '')}
          </div>
          {area.level !== 'district' && <div className="text-[11.5px] text-slate-400 truncate">{area.dname}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[28px] font-bold text-slate-900 tabular-nums leading-none">{count.toLocaleString()}</div>
          <div className="text-[11.5px] text-slate-400">เรื่อง</div>
        </div>
      </div>

      {area.level !== 'community' && count > 0 && (
        <div className="space-y-1.5">
          <SectionTitle>ในชุมชน / นอกชุมชน</SectionTitle>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
            <div style={{ width: `${pct(inCommunity, count)}%`, background: IN_COLOR }} />
            <div style={{ width: `${pct(outCommunity, count)}%`, background: OUT_COLOR }} />
          </div>
          <LegendRow color={IN_COLOR} label="ในชุมชน" value={inCommunity} total={count} />
          <LegendRow color={OUT_COLOR} label="นอกชุมชน" value={outCommunity} total={count} />
        </div>
      )}

      <div className="space-y-1.5">
        <SectionTitle>พฤติการณ์</SectionTitle>
        {behaviors.length === 0 && <p className="text-[13px] text-slate-400">ไม่ระบุพฤติการณ์</p>}
        {behaviors.map(b => (
          <div key={b.label} className="flex items-center gap-2 text-[13px]">
            <span className="w-[52px] shrink-0 text-slate-600 truncate" title={b.label}>{b.label}</span>
            <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full rounded-full"
                style={{ width: `${maxBehavior > 0 ? (b.n / maxBehavior) * 100 : 0}%`, background: BEHAVIOR_COLORS[b.label] ?? '#8b5cf6' }} />
            </span>
            <span className="w-10 text-right tabular-nums font-bold text-slate-900">{b.n.toLocaleString()}</span>
          </div>
        ))}
        {behaviors.length > 1 && (
          <p className="text-[11.5px] leading-relaxed text-slate-400">หนึ่งเรื่องมีได้หลายพฤติการณ์ รวมกันจึงอาจเกินยอดด้านบน</p>
        )}
      </div>

      {area.level !== 'community' && (
        <div className="space-y-1">
          <SectionTitle right={communities.length > 0 ? `${communities.length} แห่ง` : null}>ชุมชนที่พบเหตุการณ์</SectionTitle>
          {communities.length === 0 && <p className="text-[13px] text-slate-400">ไม่มีชุมชนที่ระบุพิกัดในพื้นที่นี้</p>}
          {communities.slice(0, TOP_COMMUNITIES).map((c, i) => (
            <div key={`${c.subdistrict}|${c.name}`} className="flex items-center gap-2 text-[13px]">
              <span className="w-3.5 shrink-0 text-slate-300 tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-slate-600" title={c.name}>{c.name}</span>
              <span className="tabular-nums font-bold text-slate-900">{c.count.toLocaleString()}</span>
            </div>
          ))}
          {restCommunities > 0 && (
            <p className="text-[11.5px] leading-relaxed text-slate-400">และอีก {restCommunities} ชุมชน — ดูครบทุกชุมชนได้ที่แผง &quot;ชุมชน&quot; ด้านล่าง</p>
          )}
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-slate-400 pt-1.5 border-t border-slate-100">
        ข้อมูลเหตุการณ์ยาเสพติด · ช่วงเวลา: <span className="font-medium text-slate-500">{periodLabel}</span>
      </p>
    </div>
  )
}
