#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""extract_arrest.py — สร้าง arrest_case / arrest_dim / arrest_age จากไฟล์ดิบ "รายละเอียดคดียาเสพติด"

Input:  data/รายละเอียดคดี.xlsx — ไฟล์เดียว 4 sheet (2 ปีงบ, 33 คอลัมน์เหมือนกันทุก sheet)
        fiscal_year มาจาก "ชื่อ sheet" ไม่ใช่ parse วันที่ (ห้วงของ sheet คือแหล่งความจริง)
Output: data/arrest_case.csv, data/arrest_dim.csv, data/arrest_age.csv (gitignored)

รัน: python scripts/extract_arrest.py

PDPA: อ่านเฉพาะคอลัมน์ที่ต้องใช้ (usecols) — ไม่โหลดคอลัมน์ชื่อ/เลขบัตรประชาชนเข้าหน่วยความจำเลย
เก็บลง CSV เฉพาะค่านับ (count/cases/persons) — ไม่มีข้อความดิบ (พฤติการณ์/ข้อหาเต็ม) หลุดออกไป
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'data'
INPUT_FILE = DATA_DIR / 'รายละเอียดคดี.xlsx'

# ชื่อ sheet สะกดตามไฟล์จริงเป๊ะ ๆ (เว้นวรรค/จุดไม่สม่ำเสมอ — ห้ามแก้ให้สวย ไม่งั้นหาไม่เจอ)
SHEET_FISCAL_YEAR = {
    '1 ต.ค. 66-31 มี.ค 67': 2567,
    '1 เม.ย.67-30 ก.ย.67': 2567,
    '1 ต.ค.67-31 มี.ค. 68': 2568,
    '1 เม.ย.68-30 ก.ย.68': 2568,
}

# ── คอลัมน์ที่ใช้ (0-based, ตามไฟล์ดิบ 33 คอลัมน์) — ห้ามเพิ่มคอลัมน์ 11(เลขบัตร)/12(ผู้ต้องหา) เด็ดขาด (PDPA) ──
COL_INDEX = {
    'bch': 0, 'bk': 1, 'station': 2, 'casenum': 3, 'recv_date': 4,
    'behavior': 9, 'seized': 10,
    'age': 13, 'nationality': 14,
    'sub_incident': 17, 'dist_incident': 18,
    'sub_domicile': 20, 'dist_domicile': 21,
    'charge': 23,
    'sub_arrest': 27, 'dist_arrest': 28,
    'casecode': 31, 'percode': 32,
}
HEADER_TO_KEY = {
    'บช': 'bch', 'บก': 'bk', 'หน่วยงาน': 'station', 'เลขคดี': 'casenum', 'วันที่รับคำร้อง': 'recv_date',
    'พฤติการณ์': 'behavior', 'ของกลางยาเสพติด': 'seized',
    'อายุ': 'age', 'สัญชาติ': 'nationality',
    'ตำบล/แขวง': 'sub_incident', 'อำเภอ/เขต': 'dist_incident',
    'ตำบล/แขวง.1': 'sub_domicile', 'อำเภอ/เขต.1': 'dist_domicile',
    'ข้อหา': 'charge',
    'ตำบล/แขวง.2': 'sub_arrest', 'อำเภอ/เขต.2': 'dist_arrest',
    'CASECODE': 'casecode', 'PERCODE': 'percode',
}

DRUG_KEYWORDS = ['ยาบ้า', 'ไอซ์', 'เฮโรอีน', 'คีตามีน', 'กัญชา', 'กระท่อม', 'โคเคน', 'ยาอี', 'ฝิ่น', 'มอร์ฟีน']

# 50 เขต กทม. (ไม่มีคำนำหน้า "เขต", สะกดด้วย ฎ ชฎา ตามที่ normalize ไว้ด้านล่าง) — DNAME_TO_GROUP ใน src/utils/constants.js
BKK_DISTRICTS = {
    'พระนคร', 'วังทองหลาง', 'ป้อมปราบศัตรูพ่าย', 'พญาไท', 'ราชเทวี', 'สัมพันธวงศ์', 'ห้วยขวาง', 'ดุสิต', 'ดินแดง',
    'พระโขนง', 'คลองเตย', 'บางคอแหลม', 'บางนา', 'บางรัก', 'ปทุมวัน', 'สวนหลวง', 'วัฒนา', 'สาทร', 'ยานนาวา',
    'จตุจักร', 'ดอนเมือง', 'บางซื่อ', 'บางเขน', 'ลาดพร้าว', 'สายไหม', 'หลักสี่',
    'คลองสามวา', 'คันนายาว', 'บางกะปิ', 'บึงกุ่ม', 'ประเวศ', 'มีนบุรี', 'ลาดกระบัง', 'สะพานสูง', 'หนองจอก',
    'จอมทอง', 'ธนบุรี', 'บางพลัด', 'คลองสาน', 'ตลิ่งชัน', 'ทวีวัฒนา', 'บางกอกน้อย', 'บางกอกใหญ่',
    'ทุ่งครุ', 'ราษฎร์บูรณะ', 'บางขุนเทียน', 'ภาษีเจริญ', 'หนองแขม', 'บางบอน', 'บางแค',
}


def load_subdistrict_names():
    p = ROOT / 'public' / 'bangkok-subdistricts.geojson'
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    return {feat['properties']['name'] for feat in d['features']}


SUBDISTRICT_NAMES = load_subdistrict_names()


# ── helpers ──────────────────────────────────────────────────────────────
def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    s = str(v).strip()
    if not s or s in ('-', 'nan', 'None', 'NaN'):
        return None
    return s


def normalize_place(s):
    # ราษฏร์ (ฏ ปฏัก) → ราษฎร์ (ฎ ชฎา) — สะกดถูกต้องตามราชบัณฑิตยฯ
    return s.replace('ราษฏร์', 'ราษฎร์') if s else s


_TRAILING_JUNK = ' \t.,()"\'ๆฯ0123456789๐๑๒๓๔๕๖๗๘๙​'


def resolve_district(row):
    for key in ('dist_arrest', 'dist_domicile', 'dist_incident'):
        v = clean(row[key])
        if v:
            return normalize_place(v)
    text = clean(row['behavior'])
    if text:
        m = re.search(r'เขต(\S+)', text)
        if m:
            cand = normalize_place(m.group(1).strip(_TRAILING_JUNK))
            if cand in BKK_DISTRICTS:
                return cand
    return 'ไม่ระบุ'


def resolve_subdistrict(row):
    for key in ('sub_arrest', 'sub_domicile', 'sub_incident'):
        v = clean(row[key])
        if v:
            return normalize_place(v)
    text = clean(row['behavior'])
    if text:
        m = re.search(r'แขวง(\S+)', text)
        if m:
            cand = normalize_place(m.group(1).strip(_TRAILING_JUNK))
            if cand in SUBDISTRICT_NAMES:
                return cand
    return 'ไม่ระบุ'


# ── charge classification: statute text → short category ──────────────────
# ตกลงกับผู้ใช้แล้ว (2026-09-07):
#   - มาตรา 90/91/... "ผลิต นำเข้า ส่งออก จำหน่าย หรือมีไว้ในครอบครอง..." แบบไม่มีวรรคท้ายบอกเจตนา (เว้นแต่ได้รับอนุญาตตาม ม.34/35) → ครอบครอง
#   - ...และเป็นการกระทำเพื่อการค้า → จำหน่าย
#   - ...และเป็นการก่อให้เกิดการแพร่กระจายในกลุ่มประชาชน → จำหน่าย
def classify_charge(text):
    t = clean(text)
    if not t:
        return 'ไม่ระบุ'
    if 'เสพสารระเหย' in t:
        return 'เสพ'
    if 'ครอบครอง' in t and 'เพื่อเสพ' in t:
        return 'ครอบครองเพื่อเสพ'
    if 'เสพยาเสพติด' in t or 'เสพวัตถุออกฤทธิ์' in t:
        return 'เสพ'
    if 'สมคบ' in t:
        return 'สมคบ'
    if 'ผลิต' in t and 'จำหน่าย' in t and 'ครอบครอง' in t:
        if 'เพื่อการค้า' in t or 'แพร่กระจายในกลุ่มประชาชน' in t:
            return 'จำหน่าย'
        return 'ครอบครอง'
    if 'จำหน่าย' in t:
        return 'จำหน่าย'
    if 'ผลิต' in t:
        return 'ผลิต'
    if 'ครอบครอง' in t:
        return 'ครอบครอง'
    if 'ส่งออก' in t or 'นำเข้า' in t:
        return 'ส่งออก'
    return 'อื่น ๆ'


# ── nationality resolution: ตกลงกับผู้ใช้แล้ว (2026-09-07), เรียงลำดับความแม่น ──
#   1. ช่อง[14] (สัญชาติ) มีค่า → ใช้เลย (canonicalize เช่น "เมียนมาร์(พม่า)" → "เมียนมาร์")
#   2. พฤติการณ์มี "สัญชาติ<คำที่รู้จัก>" → map เป็นชื่อสัญชาติมาตรฐาน (กันคำเพี้ยน/สะกดต่าง)
#   3. พฤติการณ์มีคำนำหน้าอังกฤษ (Mr./Mrs./Miss แบบมีขอบเขตชัด) → "ต่างชาติไม่ระบุ" (ดูหมายเหตุด้านล่างว่าทำไมตัด
#      เงื่อนไข "มีตัวอักษรละตินที่ไหนก็ได้" ออกจากที่ตกลงไว้ตอนแรก)
#   4. พฤติการณ์มีคำนำหน้าไทย (นาย/นาง/นางสาว/น.ส./ด.ช./ด.ญ.) ที่ต้นประโยคหรือหลังคำระบุตัว → "ไทย"
#   5. ไม่มีเงื่อนไขไหนตรง → "ไม่ระบุ"
# PDPA: ทุกขั้นตอนแค่ "ตรวจจับรูปแบบ" ไม่เคย capture/เก็บชื่อจริงออกมาเป็นค่าที่เขียนลง output เด็ดขาด
NATIONALITY_ALIASES = {
    'ไทย': 'ไทย',
    'ลาว': 'ลาว', 'สปป.ลาว': 'ลาว', 'สปป': 'ลาว',
    'เมียนมา': 'เมียนมาร์', 'เมียนมาร์': 'เมียนมาร์', 'เมียนม่าร์': 'เมียนมาร์',
    'เมียนร์มา': 'เมียนมาร์', 'เมียนมา-เมียนมา': 'เมียนมาร์', 'พม่า': 'เมียนมาร์',
    'กัมพูชา': 'กัมพูชา', 'CAMBODIA': 'กัมพูชา', 'Cambodia': 'กัมพูชา',
    'เวียดนาม': 'เวียดนาม',
    'สิงคโปร์': 'สิงคโปร์', 'สิงค์โปร์': 'สิงคโปร์',
    'ฟิลิปปินส์': 'ฟิลิปปินส์', 'ฟิลิปินส์': 'ฟิลิปปินส์',
    'ไนจีเรีย': 'ไนจีเรีย',
    'จีน': 'จีน', 'ฮ่องกง': 'ฮ่องกง',
    'อินเดีย': 'อินเดีย', 'เนปาล': 'เนปาล', 'ไต้หวัน': 'ไต้หวัน',
    'อังกฤษ': 'อังกฤษ', 'อเมริกา': 'อเมริกา', 'ออสเตรเลีย': 'ออสเตรเลีย',
    'นอร์เวย์': 'นอร์เวย์', 'แคนาดา': 'แคนาดา', 'แทนซาเนีย': 'แทนซาเนีย', 'อิหร่าน': 'อิหร่าน',
}
# เรียงคีย์ยาว→สั้น กัน "เมียนมา" ไปกิน token ก่อน "เมียนมา-เมียนมา"/"สปป.ลาว" จะแมตช์ไม่ครบ
_NAT_KEYS_SORTED = sorted(NATIONALITY_ALIASES, key=len, reverse=True)
_NAT_FROM_BEHAVIOR_RE = re.compile('สัญชาติ(' + '|'.join(re.escape(k) for k in _NAT_KEYS_SORTED) + ')')

# คำนำหน้าอังกฤษ: "Mr./MR." ต้องมีจุดต่อท้ายเมื่อไม่มีตัวอักษรตามหลังทันที (กัน "MRT"/เลขตัวถัง "MRHG" ที่เป็นคำอื่น
# ไม่ใช่คำนำหน้าคน — ของจริงในข้อมูลสะกด "Mr.JA"/"MR.KI" ติดกันไม่มีช่องว่างแต่มีจุดคั่นเสมอ)
# "Miss"/"MISS" เดี่ยว ๆ ต้องไม่ตามด้วยตัวอักษรทันที (กัน "Mississippi" ฯลฯ)
_LATIN_HONORIFIC_RE = re.compile(
    r'(?<![A-Za-z])(?:Mr\.|MR\.|Mrs\.|MRS\.|Miss(?![A-Za-z])|MISS(?![A-Za-z])|'
    r'Mrs(?![A-Za-z])|MRS(?![A-Za-z])|MR(?![A-Za-z]))'
)
# หมายเหตุ: เคยลองใช้ "มีตัวอักษรละติน [A-Za-z]{2,} ที่ไหนก็ได้ในพฤติการณ์" ตามที่ตกลงไว้ตอนแรก
# แต่พบว่า false positive สูงมาก (ยี่ห้อโทรศัพท์ VIVO/OPPO, ชุดทดสอบยา Marquis Reagent,
# รหัสสัญลักษณ์เม็ดยา WY/CC/HN, สถานีรถไฟฟ้า MRT, ชื่อเฟซบุ๊ก/นิกเนมภาษาอังกฤษของคนไทย)
# จึงตัดออก เหลือแค่คำนำหน้าอังกฤษที่เจาะจงพอ (Mr./Mrs./Miss แบบมีขอบเขตชัด) เป็นสัญญาณต่างชาติ

# คำนำหน้าไทย เรียงยาว→สั้น กัน "นาง" match ทับ "นางสาว"
_THAI_PREFIXES = ('นางสาว', 'น.ส.', 'ด.ช.', 'ด.ญ.', 'นาย', 'นาง')
# คำ/วลีที่นำหน้าการ "ระบุตัวผู้ต้องหา" ในพฤติการณ์ — ใช้เป็นจุดยึดตำแหน่ง กันแมตช์มั่ว
# เช่น "สน.นางเลิ้ง" (ชื่อสถานีตำรวจ) ที่ไม่ใช่คำนำหน้าคน
_THAI_ID_TRIGGERS = ('ทราบชื่อคือ', 'ทราบชื่อ', 'จับกุมตัว', 'จับกุม', 'พบตัว', 'พบว่า', 'พบ')


def normalize_nationality_value(raw):
    v = clean(raw)
    if not v:
        return None
    v = re.sub(r'\(.*\)\s*$', '', v).strip()
    return NATIONALITY_ALIASES.get(v, v)


def _thai_prefix_after_trigger(text):
    for trig in _THAI_ID_TRIGGERS:
        for m in re.finditer(re.escape(trig), text):
            after = text[m.end():m.end() + 8].lstrip()
            if after.startswith(_THAI_PREFIXES):
                return True
    return False


def resolve_nationality(row):
    # 1) ช่อง[14] มีค่า → ใช้เลย
    direct = normalize_nationality_value(row['nationality'])
    if direct:
        return direct

    text = clean(row['behavior'])
    if not text:
        return 'ไม่ระบุ'

    # 2) พฤติการณ์ระบุสัญชาติชัดเจน (มาก่อนข้อ 4 เสมอ — ต่างชาติบางคนก็ใช้ "นาย" ได้ ห้ามเดาทับ)
    m = _NAT_FROM_BEHAVIOR_RE.search(text)
    if m:
        return NATIONALITY_ALIASES[m.group(1)]

    # 3) คำนำหน้าอังกฤษ (Mr./Mrs./Miss) → ต่างชาติไม่ระบุสัญชาติ
    if _LATIN_HONORIFIC_RE.search(text):
        return 'ต่างชาติไม่ระบุ'

    # 4) คำนำหน้าไทย ต้นประโยค หรือหลังคำระบุตัว (กัน "สน.นางเลิ้ง" ฯลฯ หลุดมาเป็น "ไทย")
    stripped = text.strip()
    if stripped.startswith(_THAI_PREFIXES) or _thai_prefix_after_trigger(text):
        return 'ไทย'

    # 5) ไม่มีเงื่อนไขไหนตรง
    return 'ไม่ระบุ'


def extract_drugs(seized, behavior):
    text = ' '.join(x for x in (clean(seized), clean(behavior)) if x)
    if not text:
        return []
    return [kw for kw in DRUG_KEYWORDS if kw in text]


# ── load ─────────────────────────────────────────────────────────────────
def load_raw():
    if not INPUT_FILE.exists():
        print(f'✗ ไม่พบไฟล์: {INPUT_FILE}', file=sys.stderr)
        sys.exit(1)
    # อ่านทีเดียวทั้ง 4 sheet (เปิดไฟล์ครั้งเดียว) — sheet_name=list คืน dict
    sheets = pd.read_excel(
        INPUT_FILE, sheet_name=list(SHEET_FISCAL_YEAR), usecols=sorted(COL_INDEX.values()), engine='openpyxl'
    )
    frames = []
    for name, fy in SHEET_FISCAL_YEAR.items():
        df = sheets[name].rename(columns=HEADER_TO_KEY)
        df = df.dropna(how='all')
        df['fiscal_year'] = fy
        frames.append(df)
        print(f'  อ่าน sheet "{name}" → ปีงบ {fy}: {len(df)} แถว')
    return pd.concat(frames, ignore_index=True)


def main():
    print('กำลังอ่านไฟล์ดิบ...')
    df = load_raw()
    total_raw = len(df)

    # 1) dedupe 6 ค่า: บช+บก+สน+เลขคดี+วันรับ+PERCODE
    dedupe_cols = ['bch', 'bk', 'station', 'casenum', 'recv_date', 'percode']
    df = df.drop_duplicates(subset=dedupe_cols, keep='first').reset_index(drop=True)
    print(f'รวม {total_raw} แถว → dedupe เหลือ {len(df)} แถว')

    # 2) fiscal_year ติดมากับแถวตั้งแต่ load_raw() แล้ว (มาจากชื่อ sheet)
    df['fiscal_year'] = df['fiscal_year'].astype(int)

    # 3) เขต/แขวง fallback chain
    df['district'] = df.apply(resolve_district, axis=1)
    df['subdistrict'] = df.apply(resolve_subdistrict, axis=1)
    df['nationality_cat'] = df.apply(resolve_nationality, axis=1)

    # 4) กรอง กทม (เขตต้องอยู่ใน 50 เขต หรือ "ไม่ระบุ")
    n_before_filter = len(df)
    df = df[df['district'].isin(BKK_DISTRICTS) | (df['district'] == 'ไม่ระบุ')].copy()
    print(f'กรอง กทม: {n_before_filter} → {len(df)} แถว (ตัดเคสต่างจังหวัดออก)')

    # รายงาน % ไม่ระบุ
    pct_dist_unknown = (df['district'] == 'ไม่ระบุ').mean() * 100
    pct_sub_unknown = (df['subdistrict'] == 'ไม่ระบุ').mean() * 100
    print(f'เขตไม่ระบุ: {pct_dist_unknown:.1f}% | แขวงไม่ระบุ: {pct_sub_unknown:.1f}%')

    # รายงาน coverage สัญชาติ (นับต่อคน — PERCODE unique)
    nat_per_person = df[['percode', 'nationality_cat']].drop_duplicates(subset=['percode'])
    n_person = len(nat_per_person)
    n_thai = (nat_per_person['nationality_cat'] == 'ไทย').sum()
    n_foreign_unspecified = (nat_per_person['nationality_cat'] == 'ต่างชาติไม่ระบุ').sum()
    n_unknown = (nat_per_person['nationality_cat'] == 'ไม่ระบุ').sum()
    n_foreign_named = n_person - n_thai - n_foreign_unspecified - n_unknown
    pct_covered = (n_person - n_unknown) / n_person * 100 if n_person else 0
    print(
        f'สัญชาติ (นับคน, {n_person} คน): coverage {pct_covered:.1f}% | '
        f'ไทย {n_thai} | ต่างชาติระบุประเทศ {n_foreign_named} | '
        f'ต่างชาติไม่ระบุ {n_foreign_unspecified} | ไม่ระบุ {n_unknown}'
    )

    # ── arrest_case: district, subdistrict, fiscal_year, cases, persons ──
    case_group = df.groupby(['district', 'subdistrict', 'fiscal_year']).agg(
        cases=('casecode', 'nunique'),
        persons=('percode', 'nunique'),
    ).reset_index()
    case_path = DATA_DIR / 'arrest_case.csv'
    case_group.to_csv(case_path, index=False, encoding='utf-8-sig')
    print(f'✓ เขียน {case_path} ({len(case_group)} แถว)')

    # ── arrest_dim: charge=(percode,ข้อหา)unique, drug=(casecode,ยา)unique — เขตอย่างเดียว ไม่แยกแขวง ──
    df['charge_cat'] = df['charge'].apply(classify_charge)
    charge_df = df[['district', 'fiscal_year', 'percode', 'charge_cat']].drop_duplicates(subset=['percode', 'charge_cat'])
    charge_counts = charge_df.groupby(['district', 'fiscal_year', 'charge_cat']).size().reset_index(name='count')
    charge_counts = charge_counts.rename(columns={'charge_cat': 'dim_value'})
    charge_counts.insert(1, 'subdistrict', None)
    charge_counts.insert(3, 'dimension', 'charge')

    drug_rows = []
    for _, row in df[['district', 'fiscal_year', 'casecode', 'seized', 'behavior']].iterrows():
        for kw in extract_drugs(row['seized'], row['behavior']):
            drug_rows.append((row['district'], row['fiscal_year'], row['casecode'], kw))
    drug_df = pd.DataFrame(drug_rows, columns=['district', 'fiscal_year', 'casecode', 'drug_kw'])
    drug_df = drug_df.drop_duplicates(subset=['casecode', 'drug_kw'])
    drug_counts = drug_df.groupby(['district', 'fiscal_year', 'drug_kw']).size().reset_index(name='count')
    drug_counts = drug_counts.rename(columns={'drug_kw': 'dim_value'})
    drug_counts.insert(1, 'subdistrict', None)
    drug_counts.insert(3, 'dimension', 'drug')

    # dimension='nationality' — นับคน (PERCODE,สัญชาติ)unique, แยกตามแขวง (ต่างจาก charge/drug ที่รวมทั้งเขต)
    nat_df = df[['district', 'subdistrict', 'fiscal_year', 'percode', 'nationality_cat']]
    nat_df = nat_df.drop_duplicates(subset=['percode', 'nationality_cat'])
    nat_counts = nat_df.groupby(['district', 'subdistrict', 'fiscal_year', 'nationality_cat']).size().reset_index(name='count')
    nat_counts = nat_counts.rename(columns={'nationality_cat': 'dim_value'})
    nat_counts.insert(3, 'dimension', 'nationality')

    dim_out = pd.concat([charge_counts, drug_counts, nat_counts], ignore_index=True)
    dim_out = dim_out[['district', 'subdistrict', 'fiscal_year', 'dimension', 'dim_value', 'count']]
    dim_path = DATA_DIR / 'arrest_dim.csv'
    dim_out.to_csv(dim_path, index=False, encoding='utf-8-sig')
    print(f'✓ เขียน {dim_path} ({len(dim_out)} แถว)')

    # ── arrest_age: district, fiscal_year, percode, age — กรอง 0 < age <= 120 ──
    age_df = df[['district', 'fiscal_year', 'percode', 'age']].copy()
    age_df['age'] = pd.to_numeric(age_df['age'], errors='coerce')
    age_df = age_df[age_df['age'].notna() & (age_df['age'] > 0) & (age_df['age'] <= 120)]
    age_df['age'] = age_df['age'].astype(int)
    age_df = age_df.drop_duplicates(subset=['percode'])
    age_path = DATA_DIR / 'arrest_age.csv'
    age_df.to_csv(age_path, index=False, encoding='utf-8-sig')
    print(f'✓ เขียน {age_path} ({len(age_df)} แถว)')

    # ── รายงานสรุป ─────────────────────────────────────────────────────
    print('\n' + '=' * 60)
    print('สรุปผล')
    print('=' * 60)

    print('\nคดี/คน แยกปีงบ (unique CASECODE / PERCODE):')
    for fy in sorted(df['fiscal_year'].unique()):
        sub = df[df['fiscal_year'] == fy]
        print(f'  ปีงบ {fy}: คดี {sub["casecode"].nunique():,} | คน {sub["percode"].nunique():,}')
    print(f'  รวม 2 ปี: คดี {df["casecode"].nunique():,} | คน {df["percode"].nunique():,}')

    print('\n"ไม่ระบุ" (% ของแถวหลังกรอง กทม.):')
    print(f'  เขต:     {(df["district"] == "ไม่ระบุ").mean() * 100:5.1f}%')
    print(f'  แขวง:    {(df["subdistrict"] == "ไม่ระบุ").mean() * 100:5.1f}%')
    nat_unknown = nat_per_person['nationality_cat'].isin(['ไม่ระบุ']).mean() * 100
    print(f'  สัญชาติ: {nat_unknown:5.1f}% (นับต่อคน)')

    print('\nข้อหาแต่ละแบบ (unique (PERCODE, ข้อหา) แยกปีงบ):')
    charge_pivot = charge_counts.pivot_table(
        index='dim_value', columns='fiscal_year', values='count', aggfunc='sum', fill_value=0
    )
    charge_pivot['รวม'] = charge_pivot.sum(axis=1)
    for name, r in charge_pivot.sort_values('รวม', ascending=False).iterrows():
        cols = ' | '.join(f'{fy}: {int(r[fy]):>6,}' for fy in sorted(df['fiscal_year'].unique()))
        print(f'  {name:<18} {cols} | รวม {int(r["รวม"]):>6,}')

    # ── PDPA sanity check: grep เลข 13 หลัก (บัตรประชาชน) ในไฟล์ output ──
    print('\nPDPA check:')
    id13_re = re.compile(r'\d{13}')
    for path in (case_path, dim_path, age_path):
        content = path.read_text(encoding='utf-8-sig')
        hits = id13_re.findall(content)
        status = '✗ พบเลข 13 หลัก!' if hits else '✓ ไม่พบเลข 13 หลัก'
        print(f'  {path.name}: {status}')

    # dim_value เป็นคอลัมน์เดียวที่มาจากข้อความอิสระ (ไม่ใช่ชื่อเขต/แขวงจาก controlled vocab)
    # เช็คว่าไม่มีคำนำหน้าชื่อคนหลุดเข้ามาปนกับหมวดหมู่สัญชาติ
    name_leak_re = re.compile('|'.join(re.escape(p) for p in _THAI_PREFIXES))
    nat_values = sorted(dim_out.loc[dim_out['dimension'] == 'nationality', 'dim_value'].unique())
    ALLOWED_LONG_NAT = {'บุคคลที่ไม่มีสถานะทางทะเบียน'}  # ค่ามาตรฐานจากช่อง[14] ไม่ใช่ข้อความอิสระ
    name_leaks = [
        v for v in nat_values
        if v not in ALLOWED_LONG_NAT and (name_leak_re.search(v) or len(v) > 15)
    ]
    print(f'  arrest_dim.csv: ค่า nationality ทั้งหมด = {nat_values}')
    if name_leaks:
        print(f'  ✗ พบค่าสัญชาติผิดปกติ (อาจมีคำนำหน้าชื่อ/ข้อความหลุด): {name_leaks}')
    else:
        print('  ✓ ค่าสัญชาติทุกค่าเป็นหมวดหมู่สั้น ไม่มีคำนำหน้าชื่อคนปน')


if __name__ == '__main__':
    main()
