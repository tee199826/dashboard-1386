import { fetchAllPages } from "../../shared/data/supabasePagination.js"

export const SORT_OPTIONS = [
  { v: 'created_at_desc',    label: 'เพิ่มล่าสุดก่อน',             col: 'created_at',    asc: false },
  { v: 'created_at_asc',     label: 'เพิ่มเก่าสุดก่อน',            col: 'created_at',    asc: true  },
  { v: 'received_date_desc', label: 'วันที่รับเรื่อง ล่าสุดก่อน',  col: 'received_date', asc: false },
  { v: 'received_date_asc',  label: 'วันที่รับเรื่อง เก่าสุดก่อน', col: 'received_date', asc: true  },
]

const FETCH_COLS = 'id,group_no,received_date,completed_date,channel,district,subdistrict,community,province,person_type,sex,occupation,role,action_unit,urgency,status,drug,area_type'

const FETCH_PAGE = 1000

export async function fetchSortedComplaints(sortVal) {
  const opt = SORT_OPTIONS.find(o => o.v === sortVal)
  if (!opt) return []
  const rows = await fetchAllPages('complaints', FETCH_COLS, {
    batchSize: FETCH_PAGE,
    filter: q => q.order(opt.col, { ascending: opt.asc, nullsFirst: false }),
  })
  return rows.map(r => ({
    id: r.id,
    group: r.group_no,
    date: r.received_date,
    completedDate: r.completed_date,
    channel: r.channel,
    district: r.district,
    subdistrict: r.subdistrict,
    community: r.community,
    province: r.province,
    personType: r.person_type,
    actionUnit: r.action_unit,
    urgency: r.urgency,
    status: r.status,
    drug: r.drug,
    areaType: r.area_type,
  }))
}
