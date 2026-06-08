import {
  AreaChart, Area, PieChart, Pie, Cell, Sector,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import PeriodBadge from './PeriodBadge'

function Panel({ accent, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
      <div className="p-8">{children}</div>
    </div>
  )
}

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector cx={cx} cy={cy}
      innerRadius={innerRadius - 4} outerRadius={outerRadius + 14}
      startAngle={startAngle} endAngle={endAngle} fill={fill}
      style={{ filter: 'brightness(1.1) drop-shadow(0 4px 16px rgba(0,0,0,0.3))' }}
    />
  )
}

export default function BknDrugStats({
  incidentCount, yearFilter, selectedBkn, setSelectedBkn, isLevel2,
  trendData, behaviorData, behaviorTotal,
  drugData, filteredCount, top5,
  activePieIdx, setActivePieIdx, period,
}) {
  return (
    <>
      {/* ── สถิติเหตุการณ์ยาเสพติด (drug_incidents) ── */}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <h2 className="text-base font-bold text-slate-700">สถิติเหตุการณ์ยาเสพติด</h2>
        <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-medium border border-amber-200">
          จาก drug_incidents · {incidentCount.toLocaleString()} จุด
        </span>
        {yearFilter !== 'all' && (
          <span className="text-xs text-slate-400">กรองปี พ.ศ. {yearFilter}</span>
        )}
        <PeriodBadge period={period} className="ml-auto" />
      </div>

      {/* ── TREND (3/5) + BEHAVIOR DONUT (2/5) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Trend Area */}
        <div className="xl:col-span-3">
          <Panel accent="from-cyan-400 to-blue-500">
            <h3 className="text-base font-semibold text-slate-800 mb-0.5">แนวโน้มรายเดือน</h3>
            <p className="text-xs text-slate-400 mb-4">
              {trendData.length > 0 ? `${trendData.length} เดือน` : 'ไม่มีข้อมูลวันที่'}
              {selectedBkn ? ` · ${selectedBkn}` : ' · ทุก บก.น.'}
              {yearFilter !== 'all' ? ` · พ.ศ. ${yearFilter}` : ''}
            </p>
            {trendData.length > 1 ? (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 55 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }}
                    angle={-40} textAnchor="end" height={65}
                    interval={Math.max(0, Math.floor(trendData.length / 12) - 1)} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                    formatter={v => [v.toLocaleString(), 'จำนวนคดี']} />
                  <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2.5}
                    fill="url(#areaGrad)" dot={false} activeDot={{ r: 5, fill: '#3B82F6' }} name="จำนวนคดี" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                ไม่มีข้อมูลวันที่ในชุดข้อมูลนี้
              </div>
            )}
          </Panel>
        </div>

        {/* Behavior Donut */}
        <div className="xl:col-span-2">
          <Panel accent="from-blue-500 via-indigo-500 to-violet-500">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">สัดส่วนพฤติการณ์</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedBkn || 'ทุก บก.น.'}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold text-slate-800 tabular-nums leading-none">
                  {behaviorTotal.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">เรื่องรวม</div>
              </div>
            </div>
            {behaviorData.length > 0 ? (
              <>
                <div className="relative" onClick={() => setActivePieIdx(null)}>
                  <ResponsiveContainer width="100%" height={195}>
                    <PieChart>
                      <Pie data={behaviorData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={52} outerRadius={90}
                        paddingAngle={2} strokeWidth={0}
                        activeIndex={activePieIdx} activeShape={renderActiveShape}
                        onClick={(_, i, e) => { e.stopPropagation(); setActivePieIdx(p => p === i ? null : i) }}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                          if (percent < 0.05 || index === activePieIdx) return null
                          const R = Math.PI / 180
                          const r = innerRadius + (outerRadius - innerRadius) * 0.55
                          return (
                            <text
                              x={cx + r * Math.cos(-midAngle * R)}
                              y={cy + r * Math.sin(-midAngle * R)}
                              fill="white" textAnchor="middle" dominantBaseline="central"
                              style={{ fontSize: 12, fontWeight: 800, pointerEvents: 'none' }}>
                              {(percent * 100).toFixed(0)}%
                            </text>
                          )
                        }}
                      >
                        {behaviorData.map((d, i) => (
                          <Cell key={i} fill={d.color}
                            style={{ opacity: activePieIdx === null || activePieIdx === i ? 1 : 0.25, cursor: 'pointer', transition: 'opacity 0.2s' }} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-xl font-extrabold text-slate-800 tabular-nums">{behaviorTotal.toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">รวม</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {behaviorData.map(d => (
                    <div key={d.name} className="flex items-center gap-2 p-2.5 rounded-xl"
                      style={{ background: d.color + '10', border: `1px solid ${d.color}20` }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-500">{d.name}</div>
                        <div className="text-base font-extrabold text-slate-800 tabular-nums leading-snug">
                          {d.value.toLocaleString()}
                        </div>
                      </div>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: d.color }}>
                        {behaviorTotal > 0 ? ((d.value / behaviorTotal) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-56 text-slate-400 text-sm">ไม่มีข้อมูล</div>
            )}
          </Panel>
        </div>
      </div>

      {/* ── DRUG BREAKDOWN + TOP 5 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Drug type bar */}
        <Panel accent="from-violet-500 to-pink-500">
          <h3 className="text-base font-semibold text-slate-800 mb-0.5">ชนิดยาเสพติด</h3>
          <p className="text-xs text-slate-400 mb-5">
            {drugData.length} อันดับแรก · {selectedBkn || 'ทุก บก.น.'}
          </p>
          {drugData.length > 0 ? (
            <div className="space-y-3.5">
              {drugData.map((d, i) => {
                const maxCount = drugData[0].count
                const barW = maxCount > 0 ? (d.count / maxCount) * 100 : 0
                const pct = filteredCount > 0 ? ((d.count / filteredCount) * 100).toFixed(1) : '0.0'
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: d.color }}>{i + 1}</span>
                        <span className="text-sm font-semibold text-slate-700">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{pct}%</span>
                        <span className="text-sm font-bold tabular-nums w-12 text-right"
                          style={{ color: d.color }}>{d.count.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${barW}%`, background: `linear-gradient(90deg, ${d.color}88, ${d.color})` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">ไม่มีข้อมูล</div>
          )}
        </Panel>

        {/* Top 5 ranking */}
        <Panel accent="from-amber-400 to-orange-500">
          <h3 className="text-base font-semibold text-slate-800 mb-0.5">
            5 อันดับ{isLevel2 ? 'สถานีตำรวจ' : 'กองบังคับการ'}ที่มีคดีสูงสุด
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            {isLevel2 ? `${selectedBkn} · เรียงตามจำนวนคดี` : 'กองบัญชาการตำรวจนครบาล · คลิกเพื่อดูรายละเอียด'}
          </p>
          <div className="space-y-2.5">
            {top5.length > 0 ? top5.map((d, i) => {
              const maxCount = top5[0].count || 1
              const barW = (d.count / maxCount) * 100
              const MEDAL = ['🥇', '🥈', '🥉', '', ''][i]
              return (
                <div key={d.name}
                  onClick={() => !isLevel2 && setSelectedBkn(d.name)}
                  className={`p-3 rounded-xl border transition ${
                    !isLevel2 ? 'hover:border-blue-200 hover:bg-blue-50/60 cursor-pointer' : 'bg-slate-50'
                  } border-slate-100`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      {MEDAL
                        ? <span className="text-lg leading-none">{MEDAL}</span>
                        : <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">{i + 1}</span>
                      }
                      <span className="font-semibold text-slate-800 text-sm">{d.name}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums px-2.5 py-0.5 rounded-full text-white"
                      style={{ background: d.color }}>
                      {d.count.toLocaleString()} เรื่อง
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barW}%`, background: d.color }} />
                  </div>
                </div>
              )
            }) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">ไม่มีข้อมูล</div>
            )}
          </div>
        </Panel>
      </div>
    </>
  )
}
