import ExcelJS from 'exceljs'

export type ReportPeriod = 'week' | 'month' | 'year'
export type ReportFilterMode = 'preset' | 'single' | 'range'

export type ReportSummary = {
  totalTestCases: number
  tcCreatedInPeriod: number
  totalBugs: number
  bugsInPeriod: number
  totalRuns: number
  executions: {
    total: number
    pass: number
    fail: number
    blocked: number
    skip: number
    notRun: number
    executed: number
    passRate: number
  }
}

export type TrendPoint = {
  label: string
  pass: number
  fail: number
  blocked: number
  total: number
}

export type BugsBySuiteRow = {
  suiteId: string
  suiteName: string
  OPEN: number
  IN_PROGRESS: number
  RESOLVED: number
  CLOSED: number
  total: number
}

export type BugsBySuiteData = {
  totals: { OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number }
  bySuite: BugsBySuiteRow[]
}

export type ActivityWeek = { created: number; updated: number; executed: number; defects: number }

export type ActivityUser = {
  userId: string
  userName: string
  role: string
  weeks: ActivityWeek[]
  totals: ActivityWeek
}

export type UserActivityData = {
  weeks: { label: string; from: string; to: string }[]
  users: ActivityUser[]
  weekTotals: ActivityWeek[]
  overallTotals: ActivityWeek
}

export type ProjectStat = {
  projectId: string
  projectName: string
  projectStatus: string
  tcCount: number
  tcInPeriod: number
  executed: number
  passRate: number
  bugsInPeriod: number
  openBugs: number
}

export interface ReportExportPayload {
  summary: ReportSummary
  trend: TrendPoint[]
  bugsBySuite: BugsBySuiteData
  activityData: UserActivityData
  visibleUsers: ActivityUser[]
  projectStats: ProjectStat[]
  generatedAt: Date
  periodLabel: string
  projectName: string
  filterDescription: string
  weeksShown: number
}

const C = {
  navy: 'FF1E293B',
  white: 'FFFFFFFF',
  slate: 'FFF8FAFC',
  slateBorder: 'FFE2E8F0',
  grayText: 'FF334155',
  mutedText: 'FF64748B',
  section: 'FFF8FAFC',
  header: 'FFEFF4F8',
  accent: 'FF0F172A',
  greenBg: 'FFECFDF3',
  redBg: 'FFFEF2F2',
  amberBg: 'FFFFFBEB',
  orangeBg: 'FFFFF7ED',
  blueBg: 'FFEFF6FF',
  pass: '#2f855a',
  fail: '#c53030',
  blocked: '#b7791f',
}

type ArgbFill = { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } }

function fill(argb: string): ArgbFill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function applyCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: C.slateBorder } },
    left: { style: 'thin', color: { argb: C.slateBorder } },
    bottom: { style: 'thin', color: { argb: C.slateBorder } },
    right: { style: 'thin', color: { argb: C.slateBorder } },
  }
}

function styleSheetHeader(
  worksheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  toColumn: string,
  meta: Array<[string, string]>
) {
  worksheet.mergeCells(`A1:${toColumn}1`)
  worksheet.getCell('A1').value = title
  worksheet.getCell('A1').fill = fill(C.navy)
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: C.white } }
  worksheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' }
  worksheet.getRow(1).height = 24

  worksheet.mergeCells(`A2:${toColumn}2`)
  worksheet.getCell('A2').value = subtitle
  worksheet.getCell('A2').fill = fill(C.section)
  worksheet.getCell('A2').font = { size: 10, color: { argb: C.mutedText } }
  worksheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' }
  worksheet.getRow(2).height = 20

  meta.forEach(([label, value], index) => {
    const rowNumber = 4 + index
    worksheet.getCell(`A${rowNumber}`).value = label
    worksheet.getCell(`A${rowNumber}`).fill = fill(C.section)
    worksheet.getCell(`A${rowNumber}`).font = { bold: true, size: 10, color: { argb: C.grayText } }
    worksheet.getCell(`B${rowNumber}`).value = value
    worksheet.getCell(`B${rowNumber}`).font = { size: 10, color: { argb: C.accent } }
    applyCellBorder(worksheet.getCell(`A${rowNumber}`))
    applyCellBorder(worksheet.getCell(`B${rowNumber}`))
  })
}

function styleTableHeader(row: ExcelJS.Row, fillColor = C.navy) {
  row.height = 20
  row.eachCell((cell) => {
    cell.fill = fill(fillColor)
    cell.font = { bold: true, color: { argb: C.white }, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    applyCellBorder(cell)
  })
}

function styleTableBody(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  options?: {
    totalRows?: number[]
    rightAlignColumns?: number[]
    heatmapColumns?: Record<number, { bg: string; text: string }>
  }
) {
  const totalRows = new Set(options?.totalRows ?? [])
  const rightAlignColumns = new Set(options?.rightAlignColumns ?? [])
  const heatmapColumns = options?.heatmapColumns ?? {}

  for (let rowNumber = startRow; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    if (!row.hasValues) continue
    const isTotal = totalRows.has(rowNumber)
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: rightAlignColumns.has(colNumber) ? 'right' : 'left',
        wrapText: true,
      }
      cell.font = {
        size: 10,
        bold: isTotal,
        color: { argb: isTotal ? C.accent : C.grayText },
      }
      if (isTotal) {
        cell.fill = fill(C.section)
      } else if (rowNumber % 2 === 0) {
        cell.fill = fill(C.slate)
      }

      if (heatmapColumns[colNumber] && !isTotal) {
        cell.fill = fill(heatmapColumns[colNumber].bg)
        cell.font = { size: 10, bold: true, color: { argb: heatmapColumns[colNumber].text } }
      }

      applyCellBorder(cell)
    })
  }
}

function getExcelColumnName(columnNumber: number) {
  let dividend = columnNumber
  let columnName = ''

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26
    columnName = String.fromCharCode(65 + modulo) + columnName
    dividend = Math.floor((dividend - modulo) / 26)
  }

  return columnName
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildTrendChartSvg(points: TrendPoint[], width = 920, height = 320) {
  const margin = { top: 68, right: 24, bottom: 64, left: 48 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom
  const maxValue = Math.max(...points.map((point) => point.total), 1)
  const gridSteps = 4
  const slotWidth = chartWidth / Math.max(points.length, 1)
  const barWidth = Math.min(42, slotWidth * 0.58)

  const gridLines = Array.from({ length: gridSteps + 1 }, (_, index) => {
    const value = Math.round((maxValue / gridSteps) * (gridSteps - index))
    const y = margin.top + (chartHeight / gridSteps) * index
    return `
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${value}</text>
    `
  }).join('')

  const bars = points.map((point, index) => {
    const x = margin.left + slotWidth * index + (slotWidth - barWidth) / 2
    const passHeight = maxValue > 0 ? (point.pass / maxValue) * chartHeight : 0
    const failHeight = maxValue > 0 ? (point.fail / maxValue) * chartHeight : 0
    const blockedHeight = maxValue > 0 ? (point.blocked / maxValue) * chartHeight : 0
    const baseY = margin.top + chartHeight

    const blockedY = baseY - blockedHeight
    const failY = blockedY - failHeight
    const passY = failY - passHeight
    const label = escapeHtml(point.label)

    return `
      <g>
        <rect x="${x}" y="${passY}" width="${barWidth}" height="${passHeight}" rx="4" ry="4" fill="${C.pass}" />
        <rect x="${x}" y="${failY}" width="${barWidth}" height="${failHeight}" fill="${C.fail}" />
        <rect x="${x}" y="${blockedY}" width="${barWidth}" height="${blockedHeight}" fill="${C.blocked}" />
        <text x="${x + barWidth / 2}" y="${baseY + 18}" text-anchor="middle" font-size="10" fill="#475569">${label}</text>
      </g>
    `
  }).join('')

  const legend = [
    { label: 'Pass', color: C.pass },
    { label: 'Fail', color: C.fail },
    { label: 'Blocked', color: C.blocked },
  ].map((item, index) => {
    const x = width - margin.right - 280 + index * 92
    return `
      <rect x="${x}" y="20" width="12" height="12" rx="2" fill="${item.color}" />
      <text x="${x + 18}" y="30" font-size="11" fill="#334155">${item.label}</text>
    `
  }).join('')

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#ffffff" rx="12" />
      <text x="${margin.left}" y="30" font-size="14" font-weight="700" fill="#0f172a">Execution Trend</text>
      <text x="${margin.left}" y="48" font-size="10" fill="#64748b">Pass, fail, and blocked execution volume by selected reporting period</text>
      ${legend}
      ${gridLines}
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" stroke="#94a3b8" stroke-width="1.2" />
      ${bars}
    </svg>
  `
}

async function svgToPngDataUrl(svg: string, width: number, height: number) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function openPrint(html: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

function summaryCards(cards: { label: string; value: string | number; color?: string }[]) {
  return cards.map(({ label, value, color }) =>
    `<div class="card"${color ? ` style="border-top:4px solid ${color}"` : ''}><div class="lb">${escapeHtml(label)}</div><div class="vl"${color ? ` style="color:${color}"` : ''}>${value}</div></div>`
  ).join('')
}

function filterText({
  filterMode,
  period,
  singleDate,
  from,
  to,
}: {
  filterMode: ReportFilterMode
  period: ReportPeriod
  singleDate: string
  from: string
  to: string
}) {
  if (filterMode === 'single' && singleDate) return `single date ${singleDate}`
  if (filterMode === 'range') return `date range ${from || '...'} - ${to || '...'}`
  if (period === 'week') return 'this week'
  if (period === 'month') return 'this month'
  return 'this year'
}

export function buildReportExportMeta({
  filterMode,
  period,
  singleDate,
  from,
  to,
  projectFilter,
  projects,
}: {
  filterMode: ReportFilterMode
  period: ReportPeriod
  singleDate: string
  from: string
  to: string
  projectFilter: string
  projects: { id: string; name: string }[]
}) {
  const projectName = projectFilter
    ? (projects.find((project) => project.id === projectFilter)?.name ?? 'Selected Project')
    : 'All Projects'

  return {
    projectName,
    filterDescription: `${projectName} · ${filterText({ filterMode, period, singleDate, from, to })}`,
  }
}

export async function exportReportsXlsx(payload: ReportExportPayload, filename: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'QA Dashboard'
  wb.company = 'QA Dashboard'
  wb.subject = 'QA Performance Report'
  wb.title = `${payload.projectName} Reports Export`
  const chartWidth = 920
  const chartHeight = 320
  const trendChartSvg = buildTrendChartSvg(payload.trend, chartWidth, chartHeight)
  const trendChartPng = await svgToPngDataUrl(trendChartSvg, chartWidth, chartHeight)

  const summarySheet = wb.addWorksheet('Summary')
  summarySheet.columns = [
    { key: 'label', width: 24 },
    { key: 'value', width: 32 },
  ]
  summarySheet.views = [{ state: 'frozen', ySplit: 1 }]
  styleSheetHeader(
    summarySheet,
    'QA Performance Report',
    'Management-ready export generated from the active filters in Reports.',
    'B',
    [
      ['Project Scope', payload.projectName],
      ['Applied Filter', payload.filterDescription],
      ['Reporting Window', payload.periodLabel],
      ['Prepared On', payload.generatedAt.toLocaleString()],
    ]
  )

  const metaRows: [string, string | number][] = [
    ['User Activity Weeks', payload.weeksShown],
    ['Test Cases Created', payload.summary.tcCreatedInPeriod],
    ['Total Test Cases', payload.summary.totalTestCases],
    ['Bugs Reported', payload.summary.bugsInPeriod],
    ['Total Bugs', payload.summary.totalBugs],
    ['Test Runs', payload.summary.totalRuns],
    ['Executed Cases', payload.summary.executions.executed],
    ['Pass Rate', `${payload.summary.executions.passRate}%`],
    ['Pass', payload.summary.executions.pass],
    ['Fail', payload.summary.executions.fail],
    ['Blocked', payload.summary.executions.blocked],
    ['Skip', payload.summary.executions.skip],
    ['Not Run', payload.summary.executions.notRun],
  ]

  summarySheet.getCell('A10').value = 'Key Metrics'
  summarySheet.getCell('A10').fill = fill(C.navy)
  summarySheet.getCell('A10').font = { bold: true, color: { argb: C.white }, size: 11 }
  applyCellBorder(summarySheet.getCell('A10'))
  applyCellBorder(summarySheet.getCell('B10'))
  summarySheet.getCell('B10').fill = fill(C.navy)

  let metricsRow = 11
  for (const [label, value] of metaRows) {
    const row = summarySheet.getRow(metricsRow)
    row.height = 18
    row.getCell(1).value = label
    row.getCell(2).value = value
    row.getCell(1).fill = fill(C.section)
    row.getCell(1).font = { bold: true, color: { argb: C.grayText } }
    row.getCell(2).font = { color: { argb: C.accent } }
    if (label === 'Pass Rate') {
      row.getCell(2).fill = fill(C.greenBg)
      row.getCell(2).font = { bold: true, size: 12, color: { argb: 'FF166534' } }
    }
    if (label === 'Fail') {
      row.getCell(2).fill = fill(C.redBg)
      row.getCell(2).font = { bold: true, color: { argb: 'FF991B1B' } }
    }
    if (label === 'Blocked') {
      row.getCell(2).fill = fill(C.amberBg)
      row.getCell(2).font = { bold: true, color: { argb: 'FF92400E' } }
    }
    if (label === 'Skip') {
      row.getCell(2).fill = fill(C.orangeBg)
      row.getCell(2).font = { bold: true, color: { argb: 'FF9A3412' } }
    }
    applyCellBorder(row.getCell(1))
    applyCellBorder(row.getCell(2))
    metricsRow += 1
  }

  const trendSheet = wb.addWorksheet('Execution Trend')
  trendSheet.columns = [
    { header: 'Label', key: 'label', width: 24 },
    { header: 'Pass', key: 'pass', width: 12 },
    { header: 'Fail', key: 'fail', width: 12 },
    { header: 'Blocked', key: 'blocked', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
  ]
  trendSheet.views = [{ state: 'frozen', ySplit: 20 }]
  styleSheetHeader(
    trendSheet,
    'Execution Trend',
    'Visual and tabular view of pass, fail, and blocked execution volume.',
    'E',
    [
      ['Project Scope', payload.projectName],
      ['Applied Filter', payload.filterDescription],
      ['Reporting Window', payload.periodLabel],
    ]
  )

  const imageId = wb.addImage({ base64: trendChartPng, extension: 'png' })
  trendSheet.addImage(imageId, {
    tl: { col: 0, row: 7 },
    ext: { width: 760, height: 264 },
  })

  const trendHeaderRow = 21
  trendSheet.spliceRows(trendHeaderRow, 0, ['Label', 'Pass', 'Fail', 'Blocked', 'Total'])
  payload.trend.forEach((row) => trendSheet.addRow(row))
  styleTableHeader(trendSheet.getRow(trendHeaderRow))
  styleTableBody(trendSheet, trendHeaderRow + 1, {
    rightAlignColumns: [2, 3, 4, 5],
  })

  const bugsSheet = wb.addWorksheet('Bugs by Suite')
  bugsSheet.columns = [
    { header: 'Suite', key: 'suiteName', width: 32 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Open', key: 'OPEN', width: 12 },
    { header: 'In Progress', key: 'IN_PROGRESS', width: 14 },
    { header: 'Resolved', key: 'RESOLVED', width: 12 },
    { header: 'Closed', key: 'CLOSED', width: 12 },
  ]
  bugsSheet.views = [{ state: 'frozen', ySplit: 8 }]
  styleSheetHeader(
    bugsSheet,
    'Bugs by Test Suite',
    'Defect distribution and lifecycle status by impacted suite.',
    'F',
    [
      ['Project Scope', payload.projectName],
      ['Applied Filter', payload.filterDescription],
      ['Reporting Window', payload.periodLabel],
    ]
  )
  const bugHeaderRow = 8
  bugsSheet.spliceRows(bugHeaderRow, 0, ['Suite', 'Total', 'Open', 'In Progress', 'Resolved', 'Closed'])
  bugsSheet.addRow({ suiteName: 'TOTAL', ...payload.bugsBySuite.totals })
  payload.bugsBySuite.bySuite.forEach((row) => bugsSheet.addRow(row))
  styleTableHeader(bugsSheet.getRow(bugHeaderRow))
  styleTableBody(bugsSheet, bugHeaderRow + 1, {
    totalRows: [bugHeaderRow + 1],
    rightAlignColumns: [2, 3, 4, 5, 6],
  })

  const activitySheet = wb.addWorksheet('User Activity')
  const activityHeaders = [
    { header: 'User', key: 'userName', width: 24 },
    ...payload.activityData.weeks.flatMap((week, index) => ([
      { header: `${week.label} Created`, key: `w${index}_created`, width: 14 },
      { header: `${week.label} Updated`, key: `w${index}_updated`, width: 14 },
      { header: `${week.label} Executed`, key: `w${index}_executed`, width: 14 },
      { header: `${week.label} Defects`, key: `w${index}_defects`, width: 14 },
    ])),
    { header: 'Total Created', key: 'total_created', width: 14 },
    { header: 'Total Updated', key: 'total_updated', width: 14 },
    { header: 'Total Executed', key: 'total_executed', width: 14 },
    { header: 'Total Defects', key: 'total_defects', width: 14 },
  ]
  activitySheet.columns = activityHeaders
  activitySheet.views = [{ state: 'frozen', ySplit: 8, xSplit: 1 }]
  styleSheetHeader(
    activitySheet,
    'User Activity',
    'Weekly QA contribution summary based on the selected report filters.',
    getExcelColumnName(activityHeaders.length),
    [
      ['Project Scope', payload.projectName],
      ['Applied Filter', payload.filterDescription],
      ['Weeks Included', String(payload.weeksShown)],
    ]
  )

  const activityHeaderRow = 8
  activitySheet.spliceRows(activityHeaderRow, 0, activityHeaders.map((item) => item.header))

  payload.visibleUsers.forEach((user) => {
    const row: Record<string, string | number> = { userName: user.userName }
    user.weeks.forEach((week, index) => {
      row[`w${index}_created`] = week.created
      row[`w${index}_updated`] = week.updated
      row[`w${index}_executed`] = week.executed
      row[`w${index}_defects`] = week.defects
    })
    row.total_created = user.totals.created
    row.total_updated = user.totals.updated
    row.total_executed = user.totals.executed
    row.total_defects = user.totals.defects
    activitySheet.addRow(row)
  })

  const totalsRow: Record<string, string | number> = { userName: 'TOTAL' }
  payload.activityData.weekTotals.forEach((week, index) => {
    totalsRow[`w${index}_created`] = week.created
    totalsRow[`w${index}_updated`] = week.updated
    totalsRow[`w${index}_executed`] = week.executed
    totalsRow[`w${index}_defects`] = week.defects
  })
  totalsRow.total_created = payload.activityData.overallTotals.created
  totalsRow.total_updated = payload.activityData.overallTotals.updated
  totalsRow.total_executed = payload.activityData.overallTotals.executed
  totalsRow.total_defects = payload.activityData.overallTotals.defects
  activitySheet.addRow(totalsRow)
  styleTableHeader(activitySheet.getRow(activityHeaderRow))
  styleTableBody(activitySheet, activityHeaderRow + 1, {
    totalRows: [activitySheet.rowCount],
    rightAlignColumns: Array.from({ length: activityHeaders.length - 1 }, (_, index) => index + 2),
  })

  const projectSheet = wb.addWorksheet('Per Project')
  projectSheet.columns = [
    { header: 'Project', key: 'projectName', width: 28 },
    { header: 'Status', key: 'projectStatus', width: 12 },
    { header: 'TC Total', key: 'tcCount', width: 12 },
    { header: 'TC Period', key: 'tcInPeriod', width: 12 },
    { header: 'Executed', key: 'executed', width: 12 },
    { header: 'Pass Rate', key: 'passRate', width: 12 },
    { header: 'Bugs Period', key: 'bugsInPeriod', width: 12 },
    { header: 'Open Bugs', key: 'openBugs', width: 12 },
  ]
  projectSheet.views = [{ state: 'frozen', ySplit: 8 }]
  styleSheetHeader(
    projectSheet,
    'Per-Project Breakdown',
    'Comparative quality metrics across the visible project scope.',
    'H',
    [
      ['Project Scope', payload.projectName],
      ['Applied Filter', payload.filterDescription],
      ['Reporting Window', payload.periodLabel],
    ]
  )
  const projectHeaderRow = 8
  projectSheet.spliceRows(projectHeaderRow, 0, ['Project', 'Status', 'TC Total', 'TC Period', 'Executed', 'Pass Rate', 'Bugs Period', 'Open Bugs'])
  payload.projectStats.forEach((row) => projectSheet.addRow(row))
  styleTableHeader(projectSheet.getRow(projectHeaderRow))
  styleTableBody(projectSheet, projectHeaderRow + 1, {
    rightAlignColumns: [3, 4, 5, 6, 7, 8],
  })

  ;[summarySheet, trendSheet, bugsSheet, activitySheet, projectSheet].forEach((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.alignment) {
          cell.alignment = { vertical: 'middle' }
        }
      })
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  )
}

export function exportReportsPdf(payload: ReportExportPayload, filename: string) {
  const trendChartSvg = buildTrendChartSvg(payload.trend)
  const trendRows = payload.trend.map((row) =>
    `<tr><td>${escapeHtml(row.label)}</td><td>${row.pass}</td><td>${row.fail}</td><td>${row.blocked}</td><td>${row.total}</td></tr>`
  ).join('')

  const bugRows = payload.bugsBySuite.bySuite.map((row) =>
    `<tr><td>${escapeHtml(row.suiteName)}</td><td>${row.total}</td><td>${row.OPEN}</td><td>${row.IN_PROGRESS}</td><td>${row.RESOLVED}</td><td>${row.CLOSED}</td></tr>`
  ).join('')

  const activityRows = payload.visibleUsers.map((user) => {
    const weekCells = user.weeks.map((week) =>
      `<td>${week.created}</td><td>${week.updated}</td><td>${week.executed}</td><td>${week.defects}</td>`
    ).join('')
    return `<tr><td>${escapeHtml(user.userName)}</td>${weekCells}<td>${user.totals.created}</td><td>${user.totals.updated}</td><td>${user.totals.executed}</td><td>${user.totals.defects}</td></tr>`
  }).join('')

  const activityHeaderWeeks = payload.activityData.weeks.map((week) =>
    `<th colspan="4">${escapeHtml(week.label)}</th>`
  ).join('')

  const activityHeaderSub = payload.activityData.weeks.map(() =>
    '<th>Created</th><th>Updated</th><th>Executed</th><th>Defects</th>'
  ).join('')

  const projectRows = payload.projectStats.map((row) =>
    `<tr><td>${escapeHtml(row.projectName)}</td><td>${escapeHtml(row.projectStatus)}</td><td>${row.tcCount}</td><td>${row.tcInPeriod}</td><td>${row.executed}</td><td>${row.passRate}%</td><td>${row.bugsInPeriod}</td><td>${row.openBugs}</td></tr>`
  ).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(filename)}</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:10px;margin:0;color:#0f172a;background:#fff}
    h1{font-size:26px;line-height:1.15;margin:0;font-weight:700;letter-spacing:-0.02em}
    h2{font-size:14px;line-height:1.3;margin:0;color:#0f172a}
    .shell{padding:4px 2px}
    .header{border:1px solid #d8e1eb;border-radius:14px;padding:18px 20px 16px;background:linear-gradient(180deg,#f8fbfd 0%,#ffffff 100%);margin-bottom:18px}
    .eyebrow{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#64748b;margin-bottom:8px}
    .subtitle{font-size:11px;color:#475569;margin-top:8px;max-width:760px;line-height:1.45}
    .meta-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
    .meta-card{border:1px solid #dbe4ee;border-radius:10px;padding:10px 12px;background:#ffffff}
    .meta-card .k{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:4px}
    .meta-card .v{font-size:11px;font-weight:600;color:#0f172a;line-height:1.35}
    .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0 22px}
    .card{border:1px solid #dbe4ee;border-radius:10px;padding:12px 14px;background:#fff;min-height:72px}
    .lb{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
    .vl{font-size:20px;font-weight:700;line-height:1.2;margin-top:6px}
    .section{margin-top:16px;page-break-inside:avoid;border:1px solid #dbe4ee;border-radius:12px;padding:14px 16px 16px;background:#fff}
    .section-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:12px}
    .section-note{font-size:10px;color:#64748b;line-height:1.35;text-align:right;max-width:260px}
    .chart{margin:6px 0 14px;border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#fcfdff}
    .chart svg{width:100%;height:auto;display:block}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #dbe4ee;padding:6px 8px;vertical-align:top;word-break:break-word}
    th{background:#eef3f8;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#334155;font-weight:700}
    td{font-size:9px;line-height:1.35}
    tbody tr:nth-child(even) td{background:#fafcff}
    .muted{color:#64748b}
    .page-break{page-break-before:always}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .section{break-inside:avoid}
    }
  </style>
</head>
<body>
  <div class="shell">
  <div class="header">
    <div class="eyebrow">QA Performance Report</div>
    <h1>${escapeHtml(payload.projectName)}</h1>
    <div class="subtitle">Prepared for management review based on the active report filters in QA Dashboard.</div>
    <div class="meta-grid">
      <div class="meta-card"><div class="k">Scope</div><div class="v">${escapeHtml(payload.projectName)}</div></div>
      <div class="meta-card"><div class="k">Filter</div><div class="v">${escapeHtml(payload.filterDescription)}</div></div>
      <div class="meta-card"><div class="k">Reporting Window</div><div class="v">${escapeHtml(payload.periodLabel)}</div></div>
      <div class="meta-card"><div class="k">Prepared On</div><div class="v">${escapeHtml(payload.generatedAt.toLocaleString())}</div></div>
    </div>
  </div>
  <div class="summary">${summaryCards([
    { label: 'Test Cases Created', value: payload.summary.tcCreatedInPeriod },
    { label: 'Executed Cases', value: payload.summary.executions.executed },
    { label: 'Pass Rate', value: `${payload.summary.executions.passRate}%`, color: '#16a34a' },
    { label: 'Bugs Reported', value: payload.summary.bugsInPeriod, color: '#dc2626' },
    { label: 'Test Runs', value: payload.summary.totalRuns },
    { label: 'Blocked', value: payload.summary.executions.blocked, color: '#ca8a04' },
    { label: 'Skip', value: payload.summary.executions.skip, color: '#ea580c' },
    { label: 'Not Run', value: payload.summary.executions.notRun, color: '#64748b' },
  ])}</div>

  <div class="section">
    <div class="section-header">
      <h2>Execution Trend</h2>
      <span class="section-note">Operational execution mix over the selected period</span>
    </div>
    <div class="chart">${trendChartSvg}</div>
    <table>
      <thead><tr><th>Label</th><th>Pass</th><th>Fail</th><th>Blocked</th><th>Total</th></tr></thead>
      <tbody>${trendRows || '<tr><td colspan="5">No data</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-header">
      <h2>Bugs by Test Suite</h2>
      <span class="section-note">Defect concentration by affected suite</span>
    </div>
    <table>
      <thead><tr><th>Suite</th><th>Total</th><th>Open</th><th>In Progress</th><th>Resolved</th><th>Closed</th></tr></thead>
      <tbody>
        <tr><td><strong>TOTAL</strong></td><td>${payload.bugsBySuite.totals.total}</td><td>${payload.bugsBySuite.totals.OPEN}</td><td>${payload.bugsBySuite.totals.IN_PROGRESS}</td><td>${payload.bugsBySuite.totals.RESOLVED}</td><td>${payload.bugsBySuite.totals.CLOSED}</td></tr>
        ${bugRows || '<tr><td colspan="6">No data</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="section page-break">
    <div class="section-header">
      <h2>User Activity</h2>
      <span class="section-note">QA contribution summary across ${payload.weeksShown} reporting week(s)</span>
    </div>
    <table>
      <thead>
        <tr><th rowspan="2">User</th>${activityHeaderWeeks}<th colspan="4">Total</th></tr>
        <tr>${activityHeaderSub}<th>Created</th><th>Updated</th><th>Executed</th><th>Defects</th></tr>
      </thead>
      <tbody>
        ${activityRows || `<tr><td colspan="${payload.activityData.weeks.length * 4 + 5}">No data</td></tr>`}
        <tr>
          <td><strong>TOTAL</strong></td>
          ${payload.activityData.weekTotals.map((week) => `<td>${week.created}</td><td>${week.updated}</td><td>${week.executed}</td><td>${week.defects}</td>`).join('')}
          <td>${payload.activityData.overallTotals.created}</td>
          <td>${payload.activityData.overallTotals.updated}</td>
          <td>${payload.activityData.overallTotals.executed}</td>
          <td>${payload.activityData.overallTotals.defects}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-header">
      <h2>Per-Project Breakdown</h2>
      <span class="section-note">Comparative quality view across visible projects</span>
    </div>
    <table>
      <thead><tr><th>Project</th><th>Status</th><th>TC Total</th><th>TC Period</th><th>Executed</th><th>Pass Rate</th><th>Bugs Period</th><th>Open Bugs</th></tr></thead>
      <tbody>${projectRows || '<tr><td colspan="8">No data</td></tr>'}</tbody>
    </table>
  </div>
  </div>
</body>
</html>`

  openPrint(html)
}
