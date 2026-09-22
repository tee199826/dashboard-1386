// filterParams — แปลง state ของ FilterContext ↔ query params บน URL
// ใช้ส่งต่อ "ช่วงเวลา + พื้นที่ที่เลือกอยู่" ข้ามหน้า (เช่น /situation → /situation/drug-evidence)
// ให้ตัวเลขบนหน้าปลายทางตรงกับหน้าที่กดมา
// m=mode, fy=ปีงบ(คั่นด้วย ,), my/mo=ปี/เดือน, from/to=ช่วงกำหนดเอง, g/d/s/c=กลุ่ม/เขต/แขวง/ชุมชน

export function filterToParams(state, cascade) {
  const p = new URLSearchParams()
  if (state?.mode) {
    p.set('m', state.mode)
    if (state.mode === 'fiscal' && state.fiscalYears?.length) p.set('fy', state.fiscalYears.join(','))
    if (state.mode === 'month') {
      if (state.monthYear) p.set('my', String(state.monthYear))
      if (state.month) p.set('mo', String(state.month))
    }
    if (state.mode === 'custom') {
      if (state.customFrom) p.set('from', state.customFrom)
      if (state.customTo) p.set('to', state.customTo)
    }
  }
  if (cascade) {
    if (cascade.group && cascade.group !== 'all') p.set('g', cascade.group)
    if (cascade.district && cascade.district !== 'all') p.set('d', cascade.district)
    if (cascade.subdistrict && cascade.subdistrict !== 'all') p.set('s', cascade.subdistrict)
    if (cascade.community && cascade.community !== 'all') p.set('c', cascade.community)
  }
  return p
}

// คืน partial state ให้ FilterProvider ใช้เป็นค่าเริ่มต้น ; null = URL ไม่ได้ระบุตัวกรองเวลามา
export function paramsToFilter(sp) {
  const mode = sp?.get?.('m')
  if (!mode || !['fiscal', 'month', 'custom'].includes(mode)) return null
  const out = { mode }
  if (mode === 'fiscal') {
    out.fiscalYears = (sp.get('fy') || '').split(',').map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  }
  if (mode === 'month') {
    const my = Number(sp.get('my')), mo = Number(sp.get('mo'))
    out.monthYear = Number.isFinite(my) && my > 0 ? my : null
    out.month = Number.isFinite(mo) && mo >= 1 && mo <= 12 ? mo : null
  }
  if (mode === 'custom') {
    out.customFrom = sp.get('from') || null
    out.customTo = sp.get('to') || null
  }
  return out
}

// ค่าพื้นที่เริ่มต้นจาก URL (ให้ useAreaCascade ตั้งค่าเริ่มต้นได้)
export function paramsToArea(sp) {
  return {
    group: sp?.get?.('g') || 'all',
    district: sp?.get?.('d') || 'all',
    subdistrict: sp?.get?.('s') || 'all',
    community: sp?.get?.('c') || 'all',
  }
}

// path ไปหน้ารายละเอียดตัวยา พร้อมพาตัวกรองปัจจุบันไปด้วย
// scope: 'arrest' = ของกลางจากคดีจับกุม (default) | 'incidents' = ตัวยาที่พบในทุกเรื่องร้องเรียน
export function drugEvidencePath(filterState, cascade, scope = 'arrest') {
  const p = filterToParams(filterState, cascade)
  if (scope && scope !== 'arrest') p.set('scope', scope)
  const q = p.toString()
  return `/situation/drug-evidence${q ? `?${q}` : ''}`
}
