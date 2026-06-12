import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { getFiscalYearRange, getMonthRange } from '../utils/fiscalYear'

// FilterContext — 1 provider ต่อ "ขอบเขต" (page-level หรือ per-chart override = nested provider)
// state ไม่อยู่ใน URL ; reset คืนค่า default (mode fiscal + initialFiscalYear)

const FilterContext = createContext(null)

const makeInitial = (fy) => ({
  mode: 'fiscal',        // 'fiscal' | 'month' | 'custom'
  fiscalYear: fy,        // พ.ศ.
  monthYear: fy,         // พ.ศ. (ใช้กับ mode month)
  month: null,           // 1-12
  customFrom: null,      // ISO 'YYYY-MM-DD'
  customTo: null,
})

export function FilterProvider({ children, initialFiscalYear = null }) {
  const [state, setState] = useState(() => makeInitial(initialFiscalYear))

  const patch = useCallback((p) => setState(s => ({ ...s, ...p })), [])
  const setMode       = useCallback((mode) => patch({ mode }), [patch])
  const setFiscalYear = useCallback((fiscalYear) => patch({ fiscalYear }), [patch])
  const setMonthYear  = useCallback((monthYear) => patch({ monthYear }), [patch])
  const setMonth      = useCallback((month) => patch({ month }), [patch])
  const setCustomFrom = useCallback((customFrom) => patch({ customFrom }), [patch])
  const setCustomTo   = useCallback((customTo) => patch({ customTo }), [patch])
  const reset         = useCallback(() => setState(makeInitial(initialFiscalYear)), [initialFiscalYear])

  // คืน { from, to } ตาม mode ปัจจุบัน (null = ไม่ครบ/ไม่กรอง)
  const getDateRange = useCallback(() => {
    if (state.mode === 'fiscal') {
      return state.fiscalYear ? getFiscalYearRange(state.fiscalYear) : null
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
  }, [state])

  const value = useMemo(() => ({
    state, setMode, setFiscalYear, setMonthYear, setMonth, setCustomFrom, setCustomTo, reset, getDateRange,
  }), [state, setMode, setFiscalYear, setMonthYear, setMonth, setCustomFrom, setCustomTo, reset, getDateRange])

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilter() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilter must be used inside <FilterProvider>')
  return ctx
}
