import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { api } from '@/lib/api'
import {
  Download, FlaskConical, FolderTree, Bug,
  ChevronDown, ChevronRight, Loader2, FileText, FileSpreadsheet,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────────── */

type Project = { id: string; name: string }
type Suite = {
  id: string; name: string; parentId: string | null; projectId: string | null
  children?: Suite[]; _count?: { testCases: number }
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
type BugItem = {
  id: string; bugId: string; title: string; severity: string; priority: string
  type: string; status: string; steps: unknown; expectedResult: string; actualResult: string
  project?: { name: string } | null; reporter?: { name: string } | null
  assignee?: { name: string } | null; testCase?: { tcId: string } | null
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

function exportSuiteXlsx(suites: Suite[], projectName: string, filename: string) {
  const wb = XLSX.utils.book_new()
  const flat: Record<string, string | number>[] = []
  const visit = (s: Suite, depth: number) => {
    flat.push({
      'Suite Name': ('  '.repeat(depth)) + s.name,
      'TC Count': s._count?.testCases ?? 0,
    })
    s.children?.forEach((c) => visit(c, depth + 1))
  }
  suites.forEach((s) => visit(s, 0))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Metric: 'Project', Value: projectName },
    { Metric: 'Generated', Value: new Date().toLocaleString() },
    { Metric: 'Total Folders', Value: flat.length },
  ]), 'Summary')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), 'Suites')
  XLSX.writeFile(wb, filename)
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

function exportSuitePdf(suites: Suite[], projectName: string, filename: string) {
  const SUITE_COLS = ['Suite Name', 'TC Count']
  const flat: { 'Suite Name': string; 'TC Count': number }[] = []
  const visit = (s: Suite, depth: number) => {
    flat.push({ 'Suite Name': ' '.repeat(depth * 4) + s.name, 'TC Count': s._count?.testCases ?? 0 })
    s.children?.forEach((c) => visit(c, depth + 1))
  }
  suites.forEach((s) => visit(s, 0))

  const total = flat.reduce((n, r) => n + r['TC Count'], 0)
  const rows = flat.map((r) => SUITE_COLS.map((c) => `<td>${nl(String((r as Record<string, string | number>)[c]))}</td>`).join('')).map((r) => `<tr>${r}</tr>`).join('')

  openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(filename)}</title>
<style>${PDF_BASE_STYLE}</style></head><body>
<h1>Test Suites — ${esc(projectName)}</h1>
<div class="meta">Generated: ${new Date().toLocaleString()}</div>
<div class="summary">${summaryCards([
    { lb: 'Total Folders', value: flat.length },
    { lb: 'Total Test Cases', value: total },
  ])}</div>
<table><thead><tr>${SUITE_COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`)
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
  const [stSuites, setStSuites] = useState<Set<string>>(new Set())
  const [stFormat, setStFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [stLoading, setStLoading] = useState(false)

  // Bugs state
  const [bgProject, setBgProject] = useState('')
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

  function toggleSuite(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }

  function projectName(pid: string) {
    return projects.find((p) => p.id === pid)?.name ?? pid
  }

  /* ── Test Case export ──────────────────────────────────────────── */

  async function doExportTc() {
    setTcLoading(true)
    try {
      const params = new URLSearchParams({ limit: '9999' })
      if (tcProject) params.set('projectId', tcProject)

      const res = await api.get(`/test-cases?${params}`)
      let tcs: TC[] = res.data.data ?? []

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

  /* ── Suite export ──────────────────────────────────────────────── */

  async function doExportSuites() {
    setStLoading(true)
    try {
      let suites = filterSuitesByProject(allSuites, stProject)
      if (stSuites.size > 0) {
        suites = suites.filter((s) => stSuites.has(s.id))
      }
      const pName = stProject ? projectName(stProject) : 'All Projects'
      const slug = stProject ? projectName(stProject).replace(/\s+/g, '_') : 'all'
      const filename = `testsuites_${slug}`

      if (stFormat === 'xlsx') {
        exportSuiteXlsx(suites, pName, `${filename}.xlsx`)
      } else {
        exportSuitePdf(suites, pName, filename)
      }
    } finally {
      setStLoading(false)
    }
  }

  /* ── Bug export ────────────────────────────────────────────────── */

  async function doExportBugs() {
    setBugLoading(true)
    try {
      const params = new URLSearchParams({ limit: '9999' })
      if (bgProject) params.set('projectId', bgProject)

      const res = await api.get(`/bugs?${params}`)
      const bugs: BugItem[] = res.data.data ?? []

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

  const tcFolders = filterSuitesByProject(allSuites, tcProject)
  const stFolders = filterSuitesByProject(allSuites, stProject)

  const flatTcFolders = flattenSuiteTree(tcFolders)
  const flatStFolders = flattenSuiteTree(stFolders)

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
          <ProjectSelect value={stProject} onChange={(v) => { setStProject(v); setStSuites(new Set()) }} projects={projects} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Format</label>
            <FormatToggle value={stFormat} onChange={setStFormat} />
          </div>
        </div>

        {flatStFolders.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Filter by folder
              {stSuites.size > 0 && <span className="ml-2 font-medium text-foreground">({stSuites.size} selected)</span>}
              {stSuites.size > 0 && (
                <button onClick={() => setStSuites(new Set())} className="ml-2 text-xs underline text-muted-foreground">clear</button>
              )}
            </p>
            <div className="bg-background border rounded-md p-3 max-h-48 overflow-y-auto">
              {stFolders.map((s) => (
                <SuiteNode key={s.id} suite={s} selected={stSuites} onToggle={(id) => setStSuites(toggleSuite(stSuites, id))} />
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
          {stSuites.size > 0 ? ` (${stSuites.size} folder${stSuites.size > 1 ? 's' : ''})` : stProject ? ` — ${projectName(stProject)}` : ' — All'}
        </button>
      </Section>

      {/* ── Bugs ───────────────────────────────────────────────────── */}
      <Section icon={<Bug className="h-4 w-4" />} title="Bugs">
        <div className="flex flex-wrap gap-3 items-end">
          <ProjectSelect value={bgProject} onChange={setBgProject} projects={projects} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Format</label>
            <FormatToggle value={bgFormat} onChange={setBgFormat} />
          </div>
        </div>

        <button
          onClick={doExportBugs}
          disabled={bgLoading}
          className="flex items-center gap-1.5 text-xs px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {bgLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Bugs
          {bgProject ? ` — ${projectName(bgProject)}` : ' — All'}
        </button>
      </Section>
    </div>
  )
}
