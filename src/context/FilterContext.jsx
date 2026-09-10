import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { getFiscalYearRange, getMonthRange } from '../utils/fiscalYear'

// FilterContext — 1 provider ต่อ "ขอบเขต" (page-level หรือ per-chart override = nested provider)
// state ไม่อยู่ใน URL ; reset คืนค่า default (mode fiscal + initialFiscalYear)
// ปีงบเลือกได้หลายปี (fiscalYears) — fiscalYear = ปีเดียว (derived) คงไว้ให้ YoY/Operations/label เดิมใช้ต่อ

const FilterContext = createContext(null)

const deriveSingle = (years) => (years.length === 1 ? years[0] : null)

const makeInitial = (fy) => ({
  mode: 'fiscal',                        // 'fiscal' | 'month' | 'custom'
  fiscalYears: fy != null ? [fy] : [],   // พ.ศ. หลายปี (mode fiscal)
  fiscalYear: fy,                        // derived: ปีเดียว (null ถ้าเลือก 0 หรือหลายปี)
  monthYear: fy,                         // พ.ศ. (mode month)
  month: null,                           // 1-12
  customFrom: null,                      // ISO 'YYYY-MM-DD'
  customTo: null,
})

// คืน { from, to } (+ fyears ถ้าเลือกหลายปี) ตาม mode ; null = ไม่กรอง
function computeRange(state) {
  if (state.mode === 'fiscal') {
    const ys = state.fiscalYears || []
    if (ys.length === 0) return null
    const ranges = ys.map(getFiscalYearRange)
    const from = ranges.reduce((m, r) => (r.from < m ? r.from : m), ranges[0].from)
    const to = ranges.reduce((m, r) => (r.to > m ? r.to : m), ranges[0].to)
    // หลายปี: from/to = ช่วงครอบ (min→max) + fyears (Set) ให้ filterByDateColumn ตัดปีที่อยู่กลางแต่ไม่ได้เลือกออก
    return ys.length === 1 ? { from, to } : { from, to, fyears: new Set(ys) }
  }
  if (state.mode === 'month') {
    if (!state.monthYear) return null              // ทุกปี → ไม่ filter
    if (!state.month) return getFiscalYearRange(state.monthYear)  // ทุกเดือน → ทั้งปีงบ
    return getMonthRange(state.monthYear, state.month)
  }
  if (state.mode === 'custom') {
    return (state.customFrom && state.customTo) ? { from: state.customFrom, to: state.customTo } : null
  }
  return null
}

// initialState — state เริ่มต้นบางส่วน (เช่น อ่านจาก query params ตอนข้ามหน้ามา) ทับค่า default
// ควรถูก memo มาจากฝั่งผู้เรียกให้ identity คงที่
export function FilterProvider({ children, initialFiscalYear = null, initialState = null }) {
  const initial = useMemo(() => {
    const base = makeInitial(initialFiscalYear)
    if (!initialState) return base
    const merged = { ...base, ...initialState }
    // fiscalYear เป็นค่า derived — คำนวณใหม่ให้ตรงกับ fiscalYears ที่ส่งเข้ามา
    if (initialState.fiscalYears) merged.fiscalYear = deriveSingle(initialState.fiscalYears)
    return merged
  }, [initialFiscalYear, initialState])

  const [state, setState] = useState(initial)

  const patch = useCallback((p) => setState(s => ({ ...s, ...p })), [])
  const setMode        = useCallback((mode) => patch({ mode }), [patch])
  const setFiscalYears = useCallback((years) => patch({ fiscalYears: years, fiscalYear: deriveSingle(years) }), [patch])
  const setFiscalYear  = useCallback((fy) => setFiscalYears(fy == null ? [] : [fy]), [setFiscalYears])
  const toggleFiscalYear = useCallback((y) => setState(s => {
    const next = s.fiscalYears.includes(y) ? s.fiscalYears.filter(x => x !== y) : [...s.fiscalYears, y].sort((a, b) => b - a)
    return { ...s, fiscalYears: next, fiscalYear: deriveSingle(next) }
  }), [])
  const setMonthYear  = useCallback((monthYear) => patch({ monthYear }), [patch])
  const setMonth      = useCallback((month) => patch({ month }), [patch])
  const setCustomFrom = useCallback((customFrom) => patch({ customFrom }), [patch])
  const setCustomTo   = useCallback((customTo) => patch({ customTo }), [patch])
  const reset         = useCallback(() => setState(initial), [initial])

  // memoize ให้ range identity คงที่จนกว่า state จะเปลี่ยน — consumer ใช้ [range] เป็น dep ได้ตรง (รองรับหลายปี)
  const range = useMemo(() => computeRange(state), [state])
  const getDateRange = useCallback(() => range, [range])

  const value = useMemo(() => ({
    state, setMode, setFiscalYear, setFiscalYears, toggleFiscalYear,
    setMonthYear, setMonth, setCustomFrom, setCustomTo, reset, getDateRange,
  }), [state, setMode, setFiscalYear, setFiscalYears, toggleFiscalYear,
    setMonthYear, setMonth, setCustomFrom, setCustomTo, reset, getDateRange])

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilter() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilter must be used inside <FilterProvider>')
  return ctx
}
