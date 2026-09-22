// Shared worksheet writer. Callers keep their own column formats and header style.
export function createWorksheetWriter({ percentColumns, isNumericHeader, styleHeaderRow }) {
  return function writeSheet(workbook, name, metaLines, header, dataRows) {
  const ws = workbook.addWorksheet(name)
  metaLines.forEach((line) => ws.addRow([line]))
  ws.addRow([])
  const headerRow = ws.addRow(header)
  styleHeaderRow(headerRow)

  for (const row of dataRows) {
    const values = Array.isArray(row) ? row : header.map((h) => row[h])
    const excelRow = ws.addRow(values)
    values.forEach((v, i) => {
      const h = header[i]
      if (percentColumns.has(h) && typeof v === 'number') excelRow.getCell(i + 1).numFmt = '0.0%'
      else if (isNumericHeader(h) && typeof v === 'number') excelRow.getCell(i + 1).numFmt = '#,##0'
    })
  }

  const widths = header.map((h) => String(h).length)
  for (const row of dataRows) {
    const values = Array.isArray(row) ? row : header.map((h) => row[h])
    values.forEach((v, i) => {
      const len = typeof v === 'number' ? String(v).length + 2 : String(v ?? '').length
      if (len > widths[i]) widths[i] = len
    })
  }
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 50) })
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 34)
  return ws
}
}
