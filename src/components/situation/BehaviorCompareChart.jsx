// BehaviorCompareChart — stacked bar เทียบข้อหา/พฤติการณ์ 4 หมวด 2 ปีงบ ใช้ร่วม ArrestSection/IncidentsSection
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import { BEHAVIOR_FLAGS, countFlag } from '../../utils/drugFlags'
import { yearRows } from '../../utils/situationCompare'
import { COLORS, barTooltipStyle, labelStyle } from '../../utils/reportStyle'

// rowFilter ถ้าใส่มา = กรอง subset เพิ่ม (เช่น action_arrest=true) หลัง yearRows กรองพื้นที่+ปีงบแล้ว
export default function BehaviorCompareChart({ allRows, cascade, fyOld, fyNew, rowFilter, unit = 'เรื่อง' }) {
  const rowsOld = useMemo(() => {
    const r = yearRows(allRows, cascade, fyOld)
    return rowFilter ? r.filter(rowFilter) : r
  }, [allRows, cascade, fyOld, rowFilter])
  const rowsNew = useMemo(() => {
    const r = yearRows(allRows, cascade, fyNew)
    return rowFilter ? r.filter(rowFilter) : r
  }, [allRows, cascade, fyNew, rowFilter])
  const keyOld = `ปีงบ ${fyOld}`, keyNew = `ปีงบ ${fyNew}`
  const data = BEHAVIOR_FLAGS.map(([col, label]) => ({
    name: label, [keyOld]: countFlag(rowsOld, col), [keyNew]: countFlag(rowsNew, col),
  }))

  return (
    <>
      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS.slateSoft }} /> {keyOld}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS.amber }} /> {keyNew}</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#475569' }} />
          <Tooltip contentStyle={barTooltipStyle} formatter={(v) => [v.toLocaleString(), unit]} />
          <Bar dataKey={keyOld} stackId="a" fill={COLORS.slateSoft} />
          <Bar dataKey={keyNew} stackId="a" fill={COLORS.amber} radius={[0, 4, 4, 0]}>
            <LabelList dataKey={keyNew} position="right" formatter={(v) => v.toLocaleString()} style={labelStyle} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  )
}
