import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { api } from '@/lib/api'
import {
  Download, FlaskConical, FolderTree, Bug,
  ChevronDown, ChevronRight, Loader2, FileText, FileSpreadsheet, Folder,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────────── */

type Project = { id: string; name: string }
type Suite = {
  id: string; name: string; parentId: string | null; projectId: string | null
  type?: string; children?: Suite[]; _count?: { testCases: number }
}
type Step = { order?: number; action: string; testData?: string; expectedStepResult?: string }
type Execution = { status: string; actualResult?: string | null; executedAt: string }
type TC = {
  id: string; tcId: string; title: string; priority: string; type: string
  scenarioType: string; precondition?: string | null; steps: unknown
  expectedResult: string; jiraIssueKey?: string | null
  suite?: { id: string; name: string } | null
  executions: Execution[]
}
type TestRunItem = {
  id: string; name: string; suiteId: string | null; projectId: string | null
  createdAt: string; completedAt: string | null
  createdBy?: { name: string }; _count?: { executions: number }
}
type RunExecution = {
  id: string; status: string; actualResult?: string | null
  testCase: {
    id: string; tcId: string; title: string; priority: string; type: string
    scenarioType: string; expectedResult: string; jiraIssueKey?: string | null; precondition?: string | null
  }
  executor?: { name: string }
}
type BugItem = {
  id: string; bugId: string; title: string; severity: string; priority: string
  type: string; status: string; steps: unknown; expectedResult: string; actualResult: string
  project?: { name: string } | null; reporter?: { name: string } | null
  assignee?: { name: string } | null; testCase?: { id: string; tcId: string; suiteId?: string | null } | null
  createdAt: string
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function parseSteps(steps: unknown): Step[] {
  if (Array.isArray(steps)) return steps as Step[]
  if (typeof steps === 'string') {
    try { return JSON.parse(steps) as Step[] } catch { return [] }
  }
  return []
}

function stepsToText(steps: unknown) {
  return parseSteps(steps).map((s, i) => `${i + 1}. ${s.action}`).join('\n')
}

function testDataToText(steps: unknown) {
  return parseSteps(steps)
    .map((s, i) => (s.testData ? `${i + 1}. ${s.testData}` : ''))
    .filter(Boolean).join('\n')
}

function flattenSuiteTree(suites: Suite[]): Suite[] {
  const result: Suite[] = []
  const visit = (s: Suite) => { result.push(s); s.children?.forEach(visit) }
  suites.forEach(visit)
  return result
}

function filterSuitesByProject(suites: Suite[], projectId: string): Suite[] {
  if (!projectId) return suites
  return suites.filter((s) => s.projectId === projectId)
}

function filterSuitesByType(suites: Suite[], type: string): Suite[] {
  const filterNode = (s: Suite): Suite | null => {
    const children = (s.children ?? []).map(filterNode).filter(Boolean) as Suite[]
    if (s.type === type || children.length > 0) return { ...s, children }
    return null
  }
  return suites.map(filterNode).filter(Boolean) as Suite[]
}

function groupBySuite(tcs: TC[]): Map<string, { name: string; tcs: TC[] }> {
  const map = new Map<string, { name: string; tcs: TC[] }>()
  for (const tc of tcs) {
    const key = tc.suite?.id ?? '__none__'
    const name = tc.suite?.name ?? '(No Folder)'
    if (!map.has(key)) map.set(key, { name, tcs: [] })
    map.get(key)!.tcs.push(tc)
  }
  return map
}

function buildTcRow(tc: TC): Record<string, string> {
  const exec = tc.executions?.[0]
  return {
    'TC-ID': tc.tcId,
    'Title': tc.title,
    'Priority': tc.priority,
    'Type': tc.type,
    'Precondition': tc.precondition ?? '',
    'Steps': stepsToText(tc.steps),
    'Test Data': testDataToText(tc.steps),
    'Expected Result': tc.expectedResult,
    'Actual Result': exec?.actualResult ?? '',
    'Status': exec?.status ?? 'NOT_RUN',
    'Scenario Type': tc.scenarioType,
    'Jira Issue Key': tc.jiraIssueKey ?? '',
  }
}

const TC_COLS = [
  'TC-ID', 'Title', 'Priority', 'Type', 'Precondition', 'Steps', 'Test Data',
  'Expected Result', 'Actual Result', 'Status', 'Scenario Type', 'Jira Issue Key',
]

function computeTcSummary(tcs: TC[]) {
  const c = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIP: 0, NOT_RUN: 0 }
  for (const tc of tcs) {
    const s = (tc.executions?.[0]?.status ?? 'NOT_RUN') as keyof typeof c
    if (s in c) c[s]++; else c.NOT_RUN++
  }
  return { total: tcs.length, ...c }
}

const STATUS_COLOR: Record<string, string> = {
  PASS: '#16a34a', FAIL: '#dc2626', BLOCKED: '#9333ea', SKIP: '#d97706', NOT_RUN: '#6b7280',
}

/* ─── XLSX builders ──────────────────────────────────────────────── */

function exportTcXlsx(tcs: TC[], projectName: string, filename: string) {
  const s = computeTcSummary(tcs)
  const groups = groupBySuite(tcs)
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Metric: 'Project', Value: projectName },
    { Metric: 'Generated', Value: new Date().toLocaleString() },
    { Metric: 'Total Test Cases', Value: s.total },
    { Metric: 'Pass', Value: s.PASS },
    { Metric: 'Fail', Value: s.FAIL },
    { Metric: 'Blocked', Value: s.BLOCKED },
    { Metric: 'Skip', Value: s.SKIP },
    { Metric: 'Not Run', Value: s.NOT_RUN },
    { Metric: 'Pass Rate', Value: s.total > 0 ? `${Math.round((s.PASS / s.total) * 100)}%` : '-' },
  ]), 'Summary')

  const rows: Record<string, string>[] = []
  for (const [, g] of groups) {
    rows.push(Object.fromEntries(TC_COLS.map((c, i) => [c, i === 0 ? `>>> ${g.name} (${g.tcs.length})` : ''])))
    rows.push(...g.tcs.map(buildTcRow))
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Test Cases')
  XLSX.writeFile(wb, filename)
}

function exportBugXlsx(bugs: BugItem[], projectName: string, filename: string) {
  const wb = XLSX.utils.book_new()
  const byStatus = bugs.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1; return acc
  }, {})

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Metric: 'Project', Value: projectName },
    { Metric: 'Generated', Value: new Date().toLocaleString() },
    { Metric: 'Total Bugs', Value: bugs.length },
    ...Object.entries(byStatus).map(([s, n]) => ({ Metric: s, Value: n })),
  ]), 'Summary')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bugs.map((b) => ({
    'Bug-ID': b.bugId,
    'Title': b.title,
    'Severity': b.severity,
    'Priority': b.priority,
    'Type': b.type,
    'Status': b.status,
    'Steps to Reproduce': stepsToText(b.steps),
    'Expected Result': b.expectedResult,
    'Actual Result': b.actualResult,
    'Reporter': b.reporter?.name ?? '',
    'Assignee': b.assignee?.name ?? '',
    'Linked TC': b.testCase?.tcId ?? '',
    'Created At': b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '',
  }))), 'Bugs')

  XLSX.writeFile(wb, filename)
}

const RUN_EXPORT_COLS = [
  'TC-ID', 'Title', 'Priority', 'Type', 'Precondition',
  'Expected Result', 'Actual Result', 'Status', 'Scenario Type', 'Jira Issue Key', 'Executed By',
]

function buildRunRow(exec: RunExecution): Record<string, string> {
  return {
    'TC-ID': exec.testCase.tcId,
    'Title': exec.testCase.title,
    'Priority': exec.testCase.priority,
    'Type': exec.testCase.type,
    'Precondition': exec.testCase.precondition ?? '',
    'Expected Result': exec.testCase.expectedResult,
    'Actual Result': exec.actualResult ?? '',
    'Status': exec.status,
    'Scenario Type': exec.testCase.scenarioType,
    'Jira Issue Key': exec.testCase.jiraIssueKey ?? '',
    'Executed By': exec.executor?.name ?? '',
  }
}

function computeRunSummary(runs: { executions: RunExecution[] }[]) {
  const c = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIP: 0, NOT_RUN: 0, total: 0 }
  for (const run of runs) {
    for (const e of run.executions) {
      c.total++
      const s = e.status as keyof typeof c
      if (s in c) { (c as Record<string, number>)[s] += 1 }
    }
  }
  return c
}

/* Palette */
const C = {
  navy:      'FF1E293B',
  white:     'FFFFFFFF',
  passLight: 'FFDCFCE7',
  passText:  'FF166534',
  failLight: 'FFFEE2E2',
  failText:  'FF991B1B',
  blockLight:'FFF3E8FF',
  blockText: 'FF6B21A8',
  skipLight: 'FFFEF3C7',
  skipText:  'FF92400E',
  gray:      'FFF1F5F9',
  grayText:  'FF374151',
  runHeader: 'FF334155',
}

type ArgbFill = { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } }
function fill(argb: string): ArgbFill { return { type: 'pattern', pattern: 'solid', fgColor: { argb } } }

const STATUS_STYLE: Record<string, { fill: ArgbFill; font: string }> = {
  PASS:    { fill: fill(C.passLight),  font: C.passText },
  FAIL:    { fill: fill(C.failLight),  font: C.failText },
  BLOCKED: { fill: fill(C.blockLight), font: C.blockText },
  SKIP:    { fill: fill(C.skipLight),  font: C.skipText },
  NOT_RUN: { fill: fill(C.gray),       font: C.grayText },
}

const SUMMARY_METRICS = [
  { label: 'Pass',     key: 'PASS',    bg: C.passLight,  fg: C.passText  },
  { label: 'Fail',     key: 'FAIL',    bg: C.failLight,  fg: C.failText  },
  { label: 'Blocked',  key: 'BLOCKED', bg: C.blockLight, fg: C.blockText },
  { label: 'Skip',     key: 'SKIP',    bg: C.skipLight,  fg: C.skipText  },
  { label: 'Not Run',  key: 'NOT_RUN', bg: C.gray,       fg: C.grayText  },
]

async function exportRunsXlsx(
  runs: { run: TestRunItem; executions: RunExecution[] }[],
  projectName: string,
  filename: string,
) {
  const sm = computeRunSummary(runs.map((r) => ({ executions: r.executions })))
  const passRate = sm.total > 0 ? `${Math.round((sm.PASS / sm.total) * 100)}%` : '-'

  const wb = new ExcelJS.Workbook()

  /* ── Summary sheet ──────────────────────────────────────────────── */
  const ws = wb.addWorksheet('Summary')
  ws.columns = [
    { key: 'a', width: 22 },
    { key: 'b', width: 18 },
  ]

  // Title row
  const titleRow = ws.addRow(['Test Suite Execution Report', ''])
  ws.mergeCells(`A${titleRow.number}:B${titleRow.number}`)
  titleRow.getCell(1).fill = fill(C.navy)
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: C.white } }
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  titleRow.height = 28

  // Meta rows
  const metaData = [
    ['Project', projectName],
    ['Generated', new Date().toLocaleString()],
    ['Test Suites', runs.length],
    ['Total Test Cases', sm.total],
  ]
  for (const [label, value] of metaData) {
    const r = ws.addRow([label, value])
    r.getCell(1).fill = fill(C.navy)
    r.getCell(1).font = { bold: true, color: { argb: C.white } }
    r.getCell(2).fill = fill('FFE2E8F0')
    r.getCell(2).font = { color: { argb: C.grayText } }
    r.height = 18
  }

  // Spacer
  ws.addRow([])

  // Status breakdown header
  const hdrRow = ws.addRow(['Status', 'Count'])
  hdrRow.getCell(1).fill = fill(C.runHeader)
  hdrRow.getCell(2).fill = fill(C.runHeader)
  hdrRow.getCell(1).font = { bold: true, color: { argb: C.white } }
  hdrRow.getCell(2).font = { bold: true, color: { argb: C.white } }

  for (const { label, key, bg, fg } of SUMMARY_METRICS) {
    const r = ws.addRow([label, (sm as Record<string, number>)[key]])
    r.getCell(1).fill = fill(bg); r.getCell(1).font = { bold: true, color: { argb: fg } }
    r.getCell(2).fill = fill(bg); r.getCell(2).font = { bold: true, color: { argb: fg }, size: 13 }
    r.height = 20
  }

  // Pass rate row
  const prRow = ws.addRow(['Pass Rate', passRate])
  prRow.getCell(1).fill = fill(C.navy); prRow.getCell(1).font = { bold: true, color: { argb: C.white } }
  prRow.getCell(2).fill = fill(C.passLight); prRow.getCell(2).font = { bold: true, color: { argb: C.passText }, size: 14 }
  prRow.height = 22

  // Border all cells
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= 2; c++) {
      const cell = ws.getRow(r).getCell(c)
      cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
    }
  }

  /* ── Executions sheet ────────────────────────────────────────────── */
  const es = wb.addWorksheet('Executions')
  const colWidths: Record<string, number> = {
    'TC-ID': 10, 'Title': 30, 'Priority': 10, 'Type': 14, 'Precondition': 20,
    'Expected Result': 25, 'Actual Result': 25, 'Status': 11,
    'Scenario Type': 14, 'Jira Issue Key': 14, 'Executed By': 16,
  }
  es.columns = RUN_EXPORT_COLS.map((h) => ({ header: h, key: h, width: colWidths[h] ?? 14 }))

  // Header row styling
  const execHdr = es.getRow(1)
  execHdr.height = 20
  execHdr.eachCell((cell) => {
    cell.fill = fill(C.navy)
    cell.font = { bold: true, color: { argb: C.white }, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF0F172A' } } }
  })

  for (const { run, executions } of runs) {
    // Test suite section header
    const runStatus = run.completedAt ? 'Completed' : 'In Progress'
    const sectionRow = es.addRow([`${run.name}  —  ${runStatus}  (${executions.length} TCs)`, ...Array(RUN_EXPORT_COLS.length - 1).fill('')])
    es.mergeCells(`A${sectionRow.number}:K${sectionRow.number}`)
    sectionRow.height = 18
    sectionRow.getCell(1).fill = fill(C.runHeader)
    sectionRow.getCell(1).font = { bold: true, color: { argb: C.white }, size: 10 }
    sectionRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

    for (const exec of executions) {
      const row = buildRunRow(exec)
      const dataRow = es.addRow(RUN_EXPORT_COLS.map((c) => row[c] ?? ''))
      const status = row['Status']
      const st = STATUS_STYLE[status] ?? STATUS_STYLE['NOT_RUN']

      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const isStatusCol = colNum === RUN_EXPORT_COLS.indexOf('Status') + 1
        cell.fill = st.fill
        cell.font = isStatusCol
          ? { bold: true, color: { argb: st.font }, size: 9 }
          : { color: { argb: C.grayText }, size: 9 }
        cell.alignment = { vertical: 'top', wrapText: true }
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
      })
    }
  }

  // Download
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── PDF (print HTML) builders ─────────────────────────────────── */

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function nl(s: string) { return esc(s).replace(/\n/g, '<br/>') }

const PDF_BASE_STYLE = `
  body{font-family:Arial,sans-serif;font-size:10px;margin:20px;color:#111}
  h1{font-size:16px;margin-bottom:4px}
  .meta{font-size:11px;color:#555;margin-bottom:16px}
  .summary{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .sc{border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px}
  .sc .lb{font-size:9px;color:#64748b;text-transform:uppercase}
  .sc .vl{font-size:18px;font-weight:bold}
  .fh{background:#1e293b;color:#fff;font-weight:bold;padding:6px 8px;margin-top:20px;font-size:11px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th{background:#f1f5f9;text-align:left;padding:4px 6px;font-size:9px;border:1px solid #e2e8f0}
  td{padding:4px 6px;border:1px solid #e2e8f0;font-size:9px;vertical-align:top;word-break:break-word}
  tr:nth-child(even) td{background:#f8fafc}
  .PASS{color:#16a34a;font-weight:bold}.FAIL{color:#dc2626;font-weight:bold}
  .BLOCKED{color:#9333ea;font-weight:bold}.SKIP{color:#d97706;font-weight:bold}
  .NOT_RUN{color:#6b7280}
  @media print{body{margin:10px}}
`

function openPrint(html: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

function summaryCards(cards: { lb: string; value: string | number; color?: string }[]) {
  return cards.map(({ lb, value, color }) =>
    `<div class="sc"><div class="lb">${lb}</div><div class="vl"${color ? ` style="color:${color}"` : ''}>${value}</div></div>`
  ).join('')
}

function exportTcPdf(tcs: TC[], projectName: string, filename: string) {
  const s = computeTcSummary(tcs)
  const groups = groupBySuite(tcs)
  const passRate = s.total > 0 ? `${Math.round((s.PASS / s.total) * 100)}%` : '-'

  let body = ''
  for (const [, g] of groups) {
    const rows = g.tcs.map((tc) => {
      const row = buildTcRow(tc)
      const status = row['Status']
      return `<tr>${TC_COLS.map((c) => {
        const val = nl(row[c] ?? '')
        return c === 'Status' ? `<td class="${status}">${val}</td>` : `<td>${val}</td>`
      }).join('')}</tr>`
    }).join('')

    body += `<div class="fh">📁 ${esc(g.name)} (${g.tcs.length})</div>
<table><thead><tr>${TC_COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>`
  }

  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(filename)}</title>
<style>${PDF_BASE_STYLE}</style></head><body>
<h1>Execution Details — ${esc(projectName)}</h1>
<div class="meta">Generated: ${new Date().toLocaleString()} | Total: ${s.total} test cases</div>
<div class="summary">${summaryCards([
    { lb: 'Total', value: s.total },
    { lb: 'Pass', value: s.PASS, color: STATUS_COLOR.PASS },
    { lb: 'Fail', value: s.FAIL, color: STATUS_COLOR.FAIL },
    { lb: 'Blocked', value: s.BLOCKED, color: STATUS_COLOR.BLOCKED },
    { lb: 'Skip', value: s.SKIP, color: STATUS_COLOR.SKIP },
    { lb: 'Not Run', value: s.NOT_RUN, color: STATUS_COLOR.NOT_RUN },
    { lb: 'Pass Rate', value: passRate },
  ])}</div>${body}</body></html>`)
}

function exportBugPdf(bugs: BugItem[], projectName: string, filename: string) {
  const BUG_COLS = ['Bug-ID', 'Title', 'Severity', 'Priority', 'Type', 'Status',
    'Steps to Reproduce', 'Expected Result', 'Actual Result', 'Reporter', 'Assignee', 'Linked TC']

  const byStatus = bugs.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1; return acc
  }, {})

  const rows = bugs.map((b) => {
    const row: Record<string, string> = {
      'Bug-ID': b.bugId, 'Title': b.title, 'Severity': b.severity,
      'Priority': b.priority, 'Type': b.type, 'Status': b.status,
      'Steps to Reproduce': stepsToText(b.steps), 'Expected Result': b.expectedResult,
      'Actual Result': b.actualResult, 'Reporter': b.reporter?.name ?? '',
      'Assignee': b.assignee?.name ?? '', 'Linked TC': b.testCase?.tcId ?? '',
    }
    return `<tr>${BUG_COLS.map((c) => `<td>${nl(row[c] ?? '')}</td>`).join('')}</tr>`
  }).join('')

  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(filename)}</title>
<style>${PDF_BASE_STYLE}</style></head><body>
<h1>Bug Report — ${esc(projectName)}</h1>
<div class="meta">Generated: ${new Date().toLocaleString()} | Total: ${bugs.length} bugs</div>
<div class="summary">${summaryCards([
    { lb: 'Total', value: bugs.length },
    ...Object.entries(byStatus).map(([s, n]) => ({ lb: s, value: n })),
  ])}</div>
<table><thead><tr>${BUG_COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`)
}

function exportRunsPdf(runs: { run: TestRunItem; executions: RunExecution[] }[], projectName: string, filename: string) {
  const s = computeRunSummary(runs.map((r) => ({ executions: r.executions })))
  const passRate = s.total > 0 ? String(Math.round((s.PASS / s.total) * 100)) + '%' : '-'
  let body = ''
  for (const { run, executions } of runs) {
    const status = run.completedAt ? 'Completed' : 'In Progress'
    const rows = executions.map((exec) => {
      const row = buildRunRow(exec)
      const st = row['Status']
      return '<tr>' + RUN_EXPORT_COLS.map((c) => {
        const val = nl(row[c] ?? '')
        return c === 'Status' ? '<td class="' + st + '">' + val + '</td>' : '<td>' + val + '</td>'
      }).join('') + '</tr>'
    }).join('')
    body += '<div class="fh">\u{1F4CB} ' + esc(run.name) + ' — ' + status + ' (' + executions.length + ' TCs)</div>'
      + '<table><thead><tr>' + RUN_EXPORT_COLS.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
  }
  const cards = summaryCards([
    { lb: 'Total TCs', value: s.total },
    { lb: 'Pass', value: s.PASS, color: STATUS_COLOR.PASS },
    { lb: 'Fail', value: s.FAIL, color: STATUS_COLOR.FAIL },
    { lb: 'Blocked', value: s.BLOCKED, color: STATUS_COLOR.BLOCKED },
    { lb: 'Skip', value: s.SKIP, color: STATUS_COLOR.SKIP },
    { lb: 'Not Run', value: s.NOT_RUN, color: STATUS_COLOR.NOT_RUN },
    { lb: 'Pass Rate', value: passRate },
  ])
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(filename) + '</title>'
    + '<style>' + PDF_BASE_STYLE + '</style></head><body>'
    + '<h1>Test Suite Executions — ' + esc(projectName) + '</h1>'
    + '<div class="meta">Generated: ' + new Date().toLocaleString() + ' | ' + runs.length + ' test suite(s)</div>'
    + '<div class="summary">' + cards + '</div>' + body + '</body></html>'
  openPrint(html)
}

/* ─── UI sub-components ──────────────────────────────────────────── */

function SuiteNode({ suite, selected, onToggle }: { suite: Suite; selected: Set<string>; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  const hasChildren = !!suite.children?.length
  return (
    <div>
      <div className="flex items-center gap-1 py-0.5">
        <button className="p-0.5 text-muted-foreground" onClick={() => hasChildren && setOpen((o) => !o)}>
          {hasChildren
            ? open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            : <span className="w-3 h-3 inline-block" />}
        </button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={selected.has(suite.id)} onChange={() => onToggle(suite.id)} className="h-3 w-3" />
          {suite.name}
          {suite._count !== undefined && (
            <span className="text-muted-foreground ml-0.5">({suite._count.testCases})</span>
          )}
        </label>
      </div>
      {open && suite.children?.map((c) => (
        <div key={c.id} className="pl-5"><SuiteNode suite={c} selected={selected} onToggle={onToggle} /></div>
      ))}
    </div>
  )
}

/* Folder row: expand/collapse to reveal TestRun records (the actual "test suites"). */
function SuiteRunPickerNode({
  suite, runs, selected, onToggle,
}: { suite: Suite; runs: TestRunItem[]; selected: Set<string>; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const folderRuns = runs.filter((r) => r.suiteId === suite.id)

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 py-1 px-1 rounded text-xs hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted-foreground shrink-0">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="font-medium truncate">{suite.name}</span>
        {!open && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {folderRuns.length} suite{folderRuns.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="pl-6 border-l border-border/60 ml-3.5 mt-0.5 space-y-0.5">
          {folderRuns.map((run) => (
            <label
              key={run.id}
              className="flex items-center gap-1.5 text-xs cursor-pointer select-none py-0.5 px-1 rounded hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={selected.has(run.id)}
                onChange={() => onToggle(run.id)}
                className="h-3 w-3 shrink-0"
              />
              <span className="truncate">{run.name}</span>
              <span className={`ml-1 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                run.completedAt
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {run.completedAt ? 'Completed' : 'In Progress'}
              </span>
              {run._count !== undefined && (
                <span className="text-muted-foreground shrink-0">({run._count.executions} TCs)</span>
              )}
            </label>
          ))}
          {folderRuns.length === 0 && (
            <p className="text-[10px] text-muted-foreground px-1 py-0.5">No test suites in this folder</p>
          )}
        </div>
      )}
    </div>
  )
}

function FormatToggle({ value, onChange }: { value: 'xlsx' | 'pdf'; onChange: (v: 'xlsx' | 'pdf') => void }) {
  return (
    <div className="flex rounded-md border overflow-hidden">
      {(['xlsx', 'pdf'] as const).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
            value === f ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
          }`}
        >
          {f === 'xlsx' ? <FileSpreadsheet className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

function ProjectSelect({ value, onChange, projects }: {
  value: string; onChange: (v: string) => void; projects: Project[]
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">Project</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs px-2 bg-background border rounded-md"
      >
        <option value="">All Projects</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────────────── */

export default function ExportPage() {
  // Test Cases state
  const [tcProject, setTcProject] = useState('')
  const [tcSuites, setTcSuites] = useState<Set<string>>(new Set())
  const [tcFormat, setTcFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [tcLoading, setTcLoading] = useState(false)

  // Test Suites state
  const [stProject, setStProject] = useState('')
  const [stRunIds, setStRunIds] = useState<Set<string>>(new Set())
  const [stFormat, setStFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [stLoading, setStLoading] = useState(false)

  // Bugs state
  const [bgProject, setBgProject] = useState('')
  const [bgRunIds, setBgRunIds] = useState<Set<string>>(new Set())
  const [bgFormat, setBgFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [bgLoading, setBugLoading] = useState(false)

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects').then((r) => r.data.data as Project[]),
  })
  const projects = projectsData ?? []

  const { data: suitesTree } = useQuery({
    queryKey: ['suites-tree'],
    queryFn: () => api.get('/suites').then((r) => r.data.data as Suite[]),
  })
  const allSuites = suitesTree ?? []

  const { data: testRunsData } = useQuery({
    queryKey: ['test-runs-all'],
    queryFn: () => api.get('/test-runs').then((r) => r.data.data as TestRunItem[]),
  })
  const allRuns = testRunsData ?? []

  function toggleSuite(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }

  function projectName(pid: string) {
    return projects.find((p) => p.id === pid)?.name ?? pid
  }

  async function fetchAll<T>(endpoint: string, baseParams: URLSearchParams, pageLimit = 500): Promise<T[]> {
    const results: T[] = []
    let page = 1
    while (true) {
      const p = new URLSearchParams(baseParams)
      p.set('page', String(page))
      p.set('limit', String(pageLimit))
      const res = await api.get(`${endpoint}?${p}`)
      const data: T[] = res.data.data ?? []
      results.push(...data)
      const meta = res.data.meta as { totalPages?: number } | undefined
      if (data.length === 0 || !meta?.totalPages || page >= meta.totalPages) break
      page++
    }
    return results
  }

  /* ── Test Case export ──────────────────────────────────────────── */

  async function doExportTc() {
    setTcLoading(true)
    try {
      const params = new URLSearchParams()
      if (tcProject) params.set('projectId', tcProject)

      let tcs: TC[] = await fetchAll<TC>('/test-cases', params, 500)

      if (tcSuites.size > 0) {
        tcs = tcs.filter((tc) => tc.suite && tcSuites.has(tc.suite.id))
      }

      const pName = tcProject ? projectName(tcProject) : 'All Projects'
      const slug = tcProject ? projectName(tcProject).replace(/\s+/g, '_') : 'all'
      const filename = `testcases_${slug}`

      if (tcFormat === 'xlsx') {
        exportTcXlsx(tcs, pName, `${filename}.xlsx`)
      } else {
        exportTcPdf(tcs, pName, filename)
      }
    } finally {
      setTcLoading(false)
    }
  }

  /* ── Suite (TestRun) export ────────────────────────────────────── */

  async function doExportSuites() {
    setStLoading(true)
    try {
      // Determine which runs to export
      let runsToExport = stProject
        ? allRuns.filter((r) => r.projectId === stProject)
        : allRuns
      if (stRunIds.size > 0) {
        runsToExport = runsToExport.filter((r) => stRunIds.has(r.id))
      }

      // Fetch full detail (executions) for each run
      const detailed = await Promise.all(
        runsToExport.map(async (run) => {
          const res = await api.get(`/test-runs/${run.id}`)
          const full = res.data.data as { executions: RunExecution[] }
          return { run, executions: full.executions }
        })
      )

      const pName = stProject ? projectName(stProject) : 'All Projects'
      const slug = stProject ? projectName(stProject).replace(/\s+/g, '_') : 'all'
      const filename = `testsuites_${slug}`

      if (stFormat === 'xlsx') {
        await exportRunsXlsx(detailed, pName, `${filename}.xlsx`)
      } else {
        exportRunsPdf(detailed, pName, filename)
      }
    } finally {
      setStLoading(false)
    }
  }

  /* ── Bug export ────────────────────────────────────────────────── */

  async function doExportBugs() {
    setBugLoading(true)
    try {
      const params = new URLSearchParams()
      if (bgProject) params.set('projectId', bgProject)

      let bugs: BugItem[] = await fetchAll<BugItem>('/bugs', params, 500)

      if (bgRunIds.size > 0) {
        // Fetch selected runs to get their testCaseIds, then filter bugs by those IDs
        const runDetails = await Promise.all(
          Array.from(bgRunIds).map((id) =>
            api.get(`/test-runs/${id}`).then((r) => r.data.data as { executions: { testCase: { id: string } }[] })
          )
        )
        const tcIds = new Set(runDetails.flatMap((r) => r.executions.map((e) => e.testCase.id)))
        bugs = bugs.filter((b) => b.testCase && tcIds.has(b.testCase.id ?? ''))
      }

      const pName = bgProject ? projectName(bgProject) : 'All Projects'
      const slug = bgProject ? projectName(bgProject).replace(/\s+/g, '_') : 'all'
      const filename = `bugs_${slug}`

      if (bgFormat === 'xlsx') {
        exportBugXlsx(bugs, pName, `${filename}.xlsx`)
      } else {
        exportBugPdf(bugs, pName, filename)
      }
    } finally {
      setBugLoading(false)
    }
  }

  /* ── Render ────────────────────────────────────────────────────── */

  const tcFolders = filterSuitesByType(filterSuitesByProject(allSuites, tcProject), 'CASE_FOLDER')
  const stFolders = filterSuitesByType(filterSuitesByProject(allSuites, stProject), 'RUN_FOLDER')
  const bgFolders = filterSuitesByType(filterSuitesByProject(allSuites, bgProject), 'RUN_FOLDER')

  const flatTcFolders = flattenSuiteTree(tcFolders)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Export</h1>

      {/* ── Test Cases ─────────────────────────────────────────────── */}
      <Section icon={<FlaskConical className="h-4 w-4" />} title="Test Cases">
        <div className="flex flex-wrap gap-3 items-end">
          <ProjectSelect value={tcProject} onChange={(v) => { setTcProject(v); setTcSuites(new Set()) }} projects={projects} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Format</label>
            <FormatToggle value={tcFormat} onChange={setTcFormat} />
          </div>
        </div>

        {flatTcFolders.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Filter by folder
              {tcSuites.size > 0 && <span className="ml-2 font-medium text-foreground">({tcSuites.size} selected)</span>}
              {tcSuites.size > 0 && (
                <button onClick={() => setTcSuites(new Set())} className="ml-2 text-xs underline text-muted-foreground">clear</button>
              )}
            </p>
            <div className="bg-background border rounded-md p-3 max-h-48 overflow-y-auto">
              {tcFolders.map((s) => (
                <SuiteNode key={s.id} suite={s} selected={tcSuites} onToggle={(id) => setTcSuites(toggleSuite(tcSuites, id))} />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={doExportTc}
          disabled={tcLoading}
          className="flex items-center gap-1.5 text-xs px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {tcLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Test Cases
          {tcSuites.size > 0 ? ` (${tcSuites.size} folder${tcSuites.size > 1 ? 's' : ''})` : tcProject ? ` — ${projectName(tcProject)}` : ' — All'}
        </button>
      </Section>

      {/* ── Test Suites ────────────────────────────────────────────── */}
      <Section icon={<FolderTree className="h-4 w-4" />} title="Test Suites">
        <div className="flex flex-wrap gap-3 items-end">
          <ProjectSelect value={stProject} onChange={(v) => { setStProject(v); setStRunIds(new Set()) }} projects={projects} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Format</label>
            <FormatToggle value={stFormat} onChange={setStFormat} />
          </div>
        </div>

        {stFolders.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Expand folder to select test suites
              {stRunIds.size > 0 && <span className="ml-2 font-medium text-foreground">· {stRunIds.size} suite{stRunIds.size > 1 ? 's' : ''} selected</span>}
              {stRunIds.size > 0 && (
                <button onClick={() => setStRunIds(new Set())} className="ml-2 text-xs underline text-muted-foreground">clear</button>
              )}
            </p>
            <div className="bg-background border rounded-md p-3 max-h-56 overflow-y-auto space-y-0.5">
              {stFolders.map((s) => (
                <SuiteRunPickerNode
                  key={s.id}
                  suite={s}
                  runs={stProject ? allRuns.filter((r) => r.projectId === stProject) : allRuns}
                  selected={stRunIds}
                  onToggle={(id) => setStRunIds(toggleSuite(stRunIds, id))}
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={doExportSuites}
          disabled={stLoading}
          className="flex items-center gap-1.5 text-xs px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {stLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Suites
          {stRunIds.size > 0 ? ` (${stRunIds.size} suite${stRunIds.size > 1 ? 's' : ''})` : stProject ? ` — ${projectName(stProject)}` : ' — All'}
        </button>
      </Section>

      {/* ── Bugs ───────────────────────────────────────────────────── */}
      <Section icon={<Bug className="h-4 w-4" />} title="Bugs">
        <div className="flex flex-wrap gap-3 items-end">
          <ProjectSelect value={bgProject} onChange={(v) => { setBgProject(v); setBgRunIds(new Set()) }} projects={projects} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Format</label>
            <FormatToggle value={bgFormat} onChange={setBgFormat} />
          </div>
        </div>

        {bgFolders.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Expand folder to select test suites
              {bgRunIds.size > 0 && <span className="ml-2 font-medium text-foreground">· {bgRunIds.size} suite{bgRunIds.size > 1 ? 's' : ''} selected</span>}
              {bgRunIds.size > 0 && (
                <button onClick={() => setBgRunIds(new Set())} className="ml-2 text-xs underline text-muted-foreground">clear</button>
              )}
            </p>
            <div className="bg-background border rounded-md p-3 max-h-56 overflow-y-auto space-y-0.5">
              {bgFolders.map((s) => (
                <SuiteRunPickerNode
                  key={s.id}
                  suite={s}
                  runs={bgProject ? allRuns.filter((r) => r.projectId === bgProject) : allRuns}
                  selected={bgRunIds}
                  onToggle={(id) => setBgRunIds(toggleSuite(bgRunIds, id))}
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={doExportBugs}
          disabled={bgLoading}
          className="flex items-center gap-1.5 text-xs px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {bgLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Bugs
          {bgRunIds.size > 0 ? ` (${bgRunIds.size} suite${bgRunIds.size > 1 ? 's' : ''})` : bgProject ? ` — ${projectName(bgProject)}` : ' — All'}
        </button>
      </Section>
    </div>
  )
}
