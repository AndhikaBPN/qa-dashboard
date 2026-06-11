import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { api } from '@/lib/api'
import { Download, FlaskConical, FolderTree, Bug, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

/* ─── helpers ────────────────────────────────────────────────── */

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename)
}

function makeWb(sheetName: string, rows: Record<string, unknown>[]): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return wb
}

/* ─── types from API ─────────────────────────────────────────── */

type Project = { id: string; name: string }
type Suite = { id: string; name: string; parentId: string | null; projectId: string | null; children?: Suite[] }
type TcRow = Record<string, unknown>
type BugRow = Record<string, unknown>

/* ─── SuiteTreePicker ─────────────────────────────────────────── */

function SuiteNode({
  suite, selected, onToggle,
}: { suite: Suite; selected: Set<string>; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  const hasChildren = suite.children && suite.children.length > 0

  return (
    <div>
      <div className="flex items-center gap-1 py-0.5">
        <button
          className="p-0.5 text-muted-foreground"
          onClick={() => hasChildren && setOpen(!open)}
        >
          {hasChildren ? (
            open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="w-3 h-3 inline-block" />
          )}
        </button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected.has(suite.id)}
            onChange={() => onToggle(suite.id)}
            className="h-3 w-3"
          />
          {suite.name}
        </label>
      </div>
      {open && suite.children?.map((c) => (
        <div key={c.id} className="pl-5">
          <SuiteNode suite={c} selected={selected} onToggle={onToggle} />
        </div>
      ))}
    </div>
  )
}

/* ─── Section wrapper ─────────────────────────────────────────── */

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

/* ─── ExportButton ────────────────────────────────────────────── */

function ExportButton({ label, loading, onClick }: { label: string; loading?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

/* ─── Main page ───────────────────────────────────────────────── */

export default function ExportPage() {
  const [tcLoading, setTcLoading] = useState(false)
  const [suiteLoading, setSuiteLoading] = useState(false)
  const [bugLoading, setBugLoading] = useState(false)

  const [tcProjectFilter, setTcProjectFilter] = useState('')
  const [tcSuiteFilter, setTcSuiteFilter] = useState('')
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<Set<string>>(new Set())

  const [suiteProjectFilter, setSuiteProjectFilter] = useState('')
  const [bugProjectFilter, setBugProjectFilter] = useState('')

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects').then((r) => r.data.data as Project[]),
  })

  const { data: suitesTree } = useQuery({
    queryKey: ['suites-tree'],
    queryFn: () => api.get('/suites').then((r) => r.data.data as Suite[]),
  })

  function toggleSuite(id: string) {
    setSelectedSuiteIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filter suite tree by project
  function filterSuitesByProject(suites: Suite[] | undefined, pid: string): Suite[] {
    if (!suites) return []
    if (!pid) return suites
    return suites.filter((s) => !s.projectId || s.projectId === pid)
  }

  /* ─── Test Cases export ───────────────────────────────────── */

  async function exportTestCases(scope: 'all' | 'project' | 'suite') {
    setTcLoading(true)
    try {
      const params = new URLSearchParams({ limit: '5000' })
      if (scope === 'project' && tcProjectFilter) params.set('projectId', tcProjectFilter)
      if (scope === 'suite' && tcSuiteFilter) params.set('suiteId', tcSuiteFilter)

      const res = await api.get(`/test-cases?${params}`)
      const tcs: TcRow[] = (res.data.data ?? []).map((tc: Record<string, unknown>) => ({
        'ID': tc.tcId,
        'Title': tc.title,
        'Priority': tc.priority,
        'Type': tc.type,
        'Scenario Type': tc.scenarioType,
        'Project': (tc.project as { name?: string })?.name ?? '',
        'Suite': (tc.suite as { name?: string })?.name ?? '',
        'Author': (tc.author as { name?: string })?.name ?? '',
        'Jira Issue': tc.jiraIssueKey ?? '',
        'Created At': tc.createdAt ? new Date(tc.createdAt as string).toLocaleDateString() : '',
      }))

      const wb = makeWb('Test Cases', tcs)
      const suffix = scope === 'project' && tcProjectFilter
        ? `-${projectsData?.find((p) => p.id === tcProjectFilter)?.name ?? tcProjectFilter}`
        : scope === 'suite' && tcSuiteFilter
        ? '-by-suite'
        : '-all'
      downloadWorkbook(wb, `testcases${suffix}.xlsx`)
    } finally {
      setTcLoading(false)
    }
  }

  async function exportTestCasesBySelectedSuites() {
    if (selectedSuiteIds.size === 0) return
    setTcLoading(true)
    try {
      const allTcs: TcRow[] = []
      for (const suiteId of selectedSuiteIds) {
        const res = await api.get(`/test-cases?suiteId=${suiteId}&limit=5000`)
        const tcs = (res.data.data ?? []).map((tc: Record<string, unknown>) => ({
          'ID': tc.tcId,
          'Title': tc.title,
          'Priority': tc.priority,
          'Type': tc.type,
          'Scenario Type': tc.scenarioType,
          'Project': (tc.project as { name?: string })?.name ?? '',
          'Suite': (tc.suite as { name?: string })?.name ?? '',
          'Author': (tc.author as { name?: string })?.name ?? '',
          'Jira Issue': tc.jiraIssueKey ?? '',
          'Created At': tc.createdAt ? new Date(tc.createdAt as string).toLocaleDateString() : '',
        }))
        allTcs.push(...tcs)
      }
      const wb = makeWb('Test Cases', allTcs)
      downloadWorkbook(wb, 'testcases-selected-suites.xlsx')
    } finally {
      setTcLoading(false)
    }
  }

  /* ─── Suites export ───────────────────────────────────────── */

  function flattenSuites(suites: Suite[], parentName = '', projectName = ''): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = []
    for (const s of suites) {
      rows.push({
        'ID': s.id,
        'Name': s.name,
        'Parent': parentName || '(root)',
        'Project': projectName,
      })
      if (s.children?.length) {
        rows.push(...flattenSuites(s.children, s.name, projectName))
      }
    }
    return rows
  }

  async function exportSuites(scope: 'all' | 'project') {
    setSuiteLoading(true)
    try {
      const filtered = scope === 'project'
        ? filterSuitesByProject(suitesTree, suiteProjectFilter)
        : (suitesTree ?? [])

      const projectName = scope === 'project' && suiteProjectFilter
        ? projectsData?.find((p) => p.id === suiteProjectFilter)?.name ?? ''
        : ''

      const rows = flattenSuites(filtered, '', projectName)
      const wb = makeWb('Test Suites', rows)
      const suffix = scope === 'project' && suiteProjectFilter ? `-${projectName}` : '-all'
      downloadWorkbook(wb, `testsuites${suffix}.xlsx`)
    } finally {
      setSuiteLoading(false)
    }
  }

  /* ─── Bugs export ─────────────────────────────────────────── */

  async function exportBugs(scope: 'all' | 'project') {
    setBugLoading(true)
    try {
      const params = new URLSearchParams({ limit: '5000' })
      if (scope === 'project' && bugProjectFilter) params.set('projectId', bugProjectFilter)

      const res = await api.get(`/bugs?${params}`)
      const bugs: BugRow[] = (res.data.data ?? []).map((b: Record<string, unknown>) => ({
        'ID': b.bugId,
        'Title': b.title,
        'Severity': b.severity,
        'Priority': b.priority,
        'Type': b.type,
        'Status': b.status,
        'Project': (b.project as { name?: string })?.name ?? '',
        'Reporter': (b.reporter as { name?: string })?.name ?? '',
        'Assignee': (b.assignee as { name?: string })?.name ?? '',
        'Created At': b.createdAt ? new Date(b.createdAt as string).toLocaleDateString() : '',
        'Updated At': b.updatedAt ? new Date(b.updatedAt as string).toLocaleDateString() : '',
      }))

      const wb = makeWb('Bugs', bugs)
      const suffix = scope === 'project' && bugProjectFilter
        ? `-${projectsData?.find((p) => p.id === bugProjectFilter)?.name ?? bugProjectFilter}`
        : '-all'
      downloadWorkbook(wb, `bugs${suffix}.xlsx`)
    } finally {
      setBugLoading(false)
    }
  }

  const projects = projectsData ?? []
  const suitesForPicker = filterSuitesByProject(suitesTree, tcProjectFilter)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Export</h1>

      {/* ── Test Cases ─────────────────────────────────────────── */}
      <Section icon={<FlaskConical className="h-4 w-4" />} title="Test Cases">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Project filter</label>
            <select
              value={tcProjectFilter}
              onChange={(e) => { setTcProjectFilter(e.target.value); setTcSuiteFilter('') }}
              className="h-8 text-xs px-2 bg-background border rounded-md"
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Folder filter</label>
            <select
              value={tcSuiteFilter}
              onChange={(e) => setTcSuiteFilter(e.target.value)}
              className="h-8 text-xs px-2 bg-background border rounded-md"
            >
              <option value="">All Folders</option>
              {suitesForPicker.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ExportButton
            label="Export All Test Cases"
            loading={tcLoading}
            onClick={() => exportTestCases('all')}
          />
          {tcProjectFilter && (
            <ExportButton
              label={`Export by Project`}
              loading={tcLoading}
              onClick={() => exportTestCases('project')}
            />
          )}
          {tcSuiteFilter && (
            <ExportButton
              label="Export by Folder"
              loading={tcLoading}
              onClick={() => exportTestCases('suite')}
            />
          )}
        </div>

        {/* Multi-suite picker */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Or select multiple folders:</p>
          <div className="bg-background border rounded-md p-3 max-h-48 overflow-y-auto">
            {suitesForPicker.length === 0 ? (
              <p className="text-xs text-muted-foreground">No folders found</p>
            ) : (
              suitesForPicker.map((s) => (
                <SuiteNode key={s.id} suite={s} selected={selectedSuiteIds} onToggle={toggleSuite} />
              ))
            )}
          </div>
          {selectedSuiteIds.size > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedSuiteIds.size} folder(s) selected</span>
              <ExportButton
                label="Export Selected Folders"
                loading={tcLoading}
                onClick={exportTestCasesBySelectedSuites}
              />
              <button
                onClick={() => setSelectedSuiteIds(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* ── Test Suites ────────────────────────────────────────── */}
      <Section icon={<FolderTree className="h-4 w-4" />} title="Test Suites">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Project filter</label>
            <select
              value={suiteProjectFilter}
              onChange={(e) => setSuiteProjectFilter(e.target.value)}
              className="h-8 text-xs px-2 bg-background border rounded-md"
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ExportButton
            label="Export All Suites"
            loading={suiteLoading}
            onClick={() => exportSuites('all')}
          />
          {suiteProjectFilter && (
            <ExportButton
              label="Export by Project"
              loading={suiteLoading}
              onClick={() => exportSuites('project')}
            />
          )}
        </div>
      </Section>

      {/* ── Bugs ───────────────────────────────────────────────── */}
      <Section icon={<Bug className="h-4 w-4" />} title="Bugs">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Project filter</label>
            <select
              value={bugProjectFilter}
              onChange={(e) => setBugProjectFilter(e.target.value)}
              className="h-8 text-xs px-2 bg-background border rounded-md"
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ExportButton
            label="Export All Bugs"
            loading={bugLoading}
            onClick={() => exportBugs('all')}
          />
          {bugProjectFilter && (
            <ExportButton
              label="Export by Project"
              loading={bugLoading}
              onClick={() => exportBugs('project')}
            />
          )}
        </div>
      </Section>
    </div>
  )
}
