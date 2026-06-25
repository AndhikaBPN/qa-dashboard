import { useState } from 'react'
import { useIsViewer } from '@/stores/authStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Plus, Trash2, X, Search, CheckCircle2, XCircle, MinusCircle, AlertTriangle, Circle,
  Bug, ChevronRight, ChevronDown, Folder, FolderOpen, Pencil, Save,
} from 'lucide-react'
import BugFormModal from '@/components/bug/BugFormModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Suite {
  id: string
  name: string
  parentId: string | null
  orderIndex: number
  children: Suite[]
  _count: { testCases: number }
}

interface TestRun {
  id: string
  name: string
  projectId: string | null
  suiteId: string | null
  suite: { id: string; name: string } | null
  completedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  _count: { executions: number }
}

interface Execution {
  id: string
  status: string
  actualResult: string | null
  testCase: { id: string; tcId: string; title: string; priority: string; type: string }
  executor: { id: string; name: string }
}

interface ProjectTestCase {
  id: string
  tcId: string
  title: string
  priority: string
  type: string
  suite: { name: string } | null
}

interface User { id: string; name: string; email: string; role: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PASS: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  FAIL: <XCircle className="h-4 w-4 text-red-600" />,
  BLOCKED: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  SKIP: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  NOT_RUN: <Circle className="h-4 w-4 text-muted-foreground" />,
}

const STATUS_OPTIONS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED', 'SKIP']

const STATUS_COLORS: Record<string, string> = {
  PASS: 'bg-green-900/60 text-green-300',
  FAIL: 'bg-red-900/60 text-red-300',
  BLOCKED: 'bg-orange-900/60 text-orange-300',
  SKIP: 'bg-muted text-muted-foreground',
  NOT_RUN: 'bg-muted text-muted-foreground',
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function flattenSuites(suites: Suite[], depth = 0): { id: string; label: string }[] {
  return suites.flatMap((s) => [
    { id: s.id, label: `${'— '.repeat(depth)}${s.name}` },
    ...flattenSuites(s.children, depth + 1),
  ])
}

// ─── Folder Node ──────────────────────────────────────────────────────────────

function FolderNode({
  suite, selectedId, onSelect, onAddChild, onRename, onDelete, depth = 0,
}: {
  suite: Suite
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (parentId: string) => void
  onRename: (suite: Suite) => void
  onDelete: (suite: Suite) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const hasChildren = suite.children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md cursor-pointer text-sm transition-colors ${
          selectedId === suite.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
        }`}
        style={{ padding: `4px 8px 4px ${8 + depth * 14}px` }}
        onClick={() => onSelect(suite.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          className="w-4 h-4 flex items-center justify-center shrink-0"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <span className="w-3" />
          )}
        </button>
        {expanded && hasChildren ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
        )}
        <span className="flex-1 truncate ml-1">{suite.name}</span>
        {hovered && (
          <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button title="Add subfolder" onClick={() => onAddChild(suite.id)} className="p-0.5 rounded hover:bg-muted">
              <Plus className="h-3 w-3" />
            </button>
            <button title="Rename" onClick={() => onRename(suite)} className="p-0.5 rounded hover:bg-muted">
              <Pencil className="h-3 w-3" />
            </button>
            <button title="Delete" onClick={() => onDelete(suite)} className="p-0.5 rounded hover:bg-destructive/20 text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {expanded &&
        suite.children.map((child) => (
          <FolderNode
            key={child.id}
            suite={child}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onRename={onRename}
            onDelete={onDelete}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

// ─── Folder Form Modal ────────────────────────────────────────────────────────

function FolderFormModal({
  projectId, editSuite, parentId, onClose,
}: {
  projectId: string
  editSuite: Suite | null
  parentId: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(editSuite?.name ?? '')

  const createMut = useMutation({
    mutationFn: (data: { name: string; parentId?: string; projectId: string; type: string }) =>
      api.post('/suites', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suites'] }); onClose() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/suites/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suites'] }); onClose() },
  })

  function submit() {
    if (!name.trim()) return
    if (editSuite) {
      updateMut.mutate({ id: editSuite.id, name })
    } else {
      createMut.mutate({ name, projectId, type: 'RUN_FOLDER', ...(parentId ? { parentId } : {}) })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border rounded-lg shadow-lg p-5 w-80">
        <h3 className="text-sm font-semibold mb-3">
          {editSuite ? 'Rename Folder' : parentId ? 'New Subfolder' : 'New Folder'}
        </h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
          placeholder="Folder name"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">Cancel</button>
          <button
            onClick={submit}
            disabled={!name.trim() || createMut.isPending || updateMut.isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {editSuite ? 'Rename' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Suite (TestRun) Modal ─────────────────────────────────────────────

function CreateRunModal({
  projectId, suites, defaultSuiteId, onClose,
}: {
  projectId: string
  suites: Suite[]
  defaultSuiteId: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [suiteId, setSuiteId] = useState(defaultSuiteId ?? '')
  const [tcFolderFilter, setTcFolderFilter] = useState('')  // CASE_FOLDER filter
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Fetch CASE_FOLDER suites for filtering TCs
  const { data: caseFoldersData } = useQuery({
    queryKey: ['suites', projectId, 'CASE_FOLDER'],
    queryFn: () =>
      api.get('/suites', { params: { projectId, type: 'CASE_FOLDER' } }).then((r) => r.data.data as any[]),
  })
  const caseFolders: Suite[] = caseFoldersData ?? []

  const { data: tcData } = useQuery({
    queryKey: ['test-cases-picker', projectId, tcFolderFilter],
    queryFn: () =>
      api
        .get('/test-cases', {
          params: {
            projectId,
            ...(tcFolderFilter ? { suiteId: tcFolderFilter } : {}),
            limit: 200,
          },
        })
        .then((r) => r.data.data),
  })

  const testCases: ProjectTestCase[] = tcData ?? []
  const filtered = testCases.filter(
    (tc) =>
      !search ||
      tc.title.toLowerCase().includes(search.toLowerCase()) ||
      tc.tcId.toLowerCase().includes(search.toLowerCase())
  )

  const createMut = useMutation({
    mutationFn: (body: any) => api.post('/test-runs', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-runs'] }); onClose() },
  })

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((tc) => tc.id)))
  }

  // When folder filter changes, deselect TCs no longer visible
  function handleFolderChange(folderId: string) {
    setTcFolderFilter(folderId)
    setSelected(new Set())
  }

  function submit() {
    if (!name.trim() || selected.size === 0) return
    createMut.mutate({
      name,
      projectId,
      ...(suiteId ? { suiteId } : {}),
      testCaseIds: Array.from(selected),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">New Test Suite</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Suite name */}
          <div>
            <label className="text-xs font-medium mb-1 block">Suite Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              placeholder="e.g. Sprint 1 Regression"
            />
          </div>

          {/* Run folder picker (RUN_FOLDER) */}
          <div>
            <label className="text-xs font-medium mb-1 block">Folder</label>
            <select
              value={suiteId}
              onChange={(e) => setSuiteId(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            >
              <option value="">— No folder —</option>
              {flattenSuites(suites).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* TC picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">
                Select Test Cases ({selected.size} selected)
              </label>
              <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* TC folder filter */}
            <select
              value={tcFolderFilter}
              onChange={(e) => handleFolderChange(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background mb-2"
            >
              <option value="">All folders</option>
              {flattenSuites(caseFolders).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>

            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search test cases..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
            </div>

            <div className="border rounded-md overflow-hidden max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {tcFolderFilter ? 'No test cases in this folder.' : 'No test cases found.'}
                </div>
              ) : (
                filtered.map((tc) => (
                  <label
                    key={tc.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer border-b last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(tc.id)}
                      onChange={() => toggle(tc.id)}
                      className="rounded"
                    />
                    <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{tc.tcId}</span>
                    <span className="text-sm flex-1 truncate">{tc.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{tc.priority}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || selected.size === 0 || createMut.isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            Create Suite
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expanded Row ────────────────────────────────────────────────────────────

interface Step {
  order: number
  action: string
  testData: string
  expectedStepResult: string
}

interface FullTestCase {
  id: string
  tcId: string
  title: string
  priority: string
  type: string
  scenarioType: string
  precondition: string | null
  steps: Step[]
  expectedResult: string
}

function ExpandedRow({
  exec, colSpan, onClose,
}: {
  exec: Execution
  colSpan: number
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [actualResult, setActualResult] = useState(exec.actualResult ?? '')
  const [saved, setSaved] = useState(false)

  const { data: tc, isLoading } = useQuery<FullTestCase>({
    queryKey: ['test-case', exec.testCase.id],
    queryFn: () => api.get(`/test-cases/${exec.testCase.id}`).then((r) => r.data.data),
  })

  const saveActualMut = useMutation({
    mutationFn: () => api.put(`/executions/${exec.id}`, { status: exec.status, actualResult }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-run'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const steps: Step[] = Array.isArray(tc?.steps) ? tc.steps : []

  return (
    <tr>
      <td colSpan={colSpan} className="px-0 py-0">
        <div className="border-t border-b bg-muted/10 px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading details…</div>
          ) : (
            <>
              {/* Precondition */}
              {tc?.precondition && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Pre-conditions
                  </p>
                  <p className="text-sm text-foreground/80 bg-background border rounded-md px-3 py-2">
                    {tc.precondition}
                  </p>
                </div>
              )}

              {/* Steps table */}
              {steps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Execution Steps
                  </p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-8">#</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Step</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-40">Data</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-56">Expected Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {steps.map((step, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2.5 text-xs text-muted-foreground align-top">{step.order}</td>
                            <td className="px-3 py-2.5 text-sm align-top whitespace-pre-wrap">{step.action}</td>
                            <td className="px-3 py-2.5 text-sm text-muted-foreground align-top whitespace-pre-wrap">
                              {step.testData || <span className="italic text-xs">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-sm text-muted-foreground align-top whitespace-pre-wrap">
                              {step.expectedStepResult || <span className="italic text-xs">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Overall expected result */}
              {tc?.expectedResult && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Expected Result
                  </p>
                  <p className="text-sm text-foreground/80 bg-background border rounded-md px-3 py-2">
                    {tc.expectedResult}
                  </p>
                </div>
              )}

              {/* Actual Result */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Actual Result
                </p>
                <div className="flex gap-2 items-start">
                  <textarea
                    value={actualResult}
                    onChange={(e) => setActualResult(e.target.value)}
                    rows={2}
                    placeholder="Enter actual result…"
                    className="flex-1 border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <button
                    onClick={() => saveActualMut.mutate()}
                    disabled={saveActualMut.isPending}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border transition-colors shrink-0 ${
                      saved
                        ? 'border-green-600 text-green-400 bg-green-900/20'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          )}
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground underline">
            Collapse
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Suite Detail Panel ───────────────────────────────────────────────────────

function SuiteDetailPanel({
  runId, projectId: _projectId, onClose, onReportBug,
}: {
  runId: string
  projectId: string
  onClose: () => void
  onReportBug: (tcId: string) => void
}) {
  const qc = useQueryClient()

  const { data: runData, isLoading } = useQuery({
    queryKey: ['test-run', runId],
    queryFn: () => api.get(`/test-runs/${runId}`).then((r) => r.data.data),
  })

  const { data: progressData } = useQuery({
    queryKey: ['test-run-progress', runId],
    queryFn: () => api.get(`/test-runs/${runId}/progress`).then((r) => r.data.data),
    refetchInterval: 5000,
  })

  const [expandedExecId, setExpandedExecId] = useState<string | null>(null)
  const [selectedExecIds, setSelectedExecIds] = useState<Set<string>>(new Set())
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false)
  const isViewer = useIsViewer()

  const updateStatusMut = useMutation({
    mutationFn: ({ execId, status }: { execId: string; status: string }) =>
      api.put(`/executions/${execId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-run', runId] })
      qc.invalidateQueries({ queryKey: ['test-run-progress', runId] })
    },
  })

  const bulkRemoveMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/executions/bulk-delete', { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-run', runId] })
      qc.invalidateQueries({ queryKey: ['test-run-progress', runId] })
      setSelectedExecIds(new Set())
      setBulkRemoveConfirm(false)
    },
  })

  const executions: Execution[] = runData?.executions ?? []
  const progress = progressData ?? { total: 0, pass: 0, fail: 0, blocked: 0, skip: 0, notRun: 0, passRate: 0 }
  const allExecsSelected = executions.length > 0 && executions.every((e) => selectedExecIds.has(e.id))

  function toggleExec(id: string) {
    setSelectedExecIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAllExecs() {
    if (allExecsSelected) setSelectedExecIds(new Set())
    else setSelectedExecIds(new Set(executions.map((e) => e.id)))
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-4xl bg-background border-l shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold">{runData?.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {runData?.suite && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Folder className="h-3 w-3" /> {runData.suite.name}
                </span>
              )}
              {runData?.completedAt && (
                <span className="text-xs text-green-600">● Completed</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {progress.total > 0 && (
          <div className="px-5 py-3 border-b bg-muted/20">
            <div className="flex gap-4 text-xs mb-2">
              <span className="text-green-600">✓ {progress.pass} Pass</span>
              <span className="text-red-600">✗ {progress.fail} Fail</span>
              <span className="text-orange-500">⊘ {progress.blocked} Blocked</span>
              <span className="text-muted-foreground">— {progress.skip} Skip</span>
              <span className="text-muted-foreground">○ {progress.notRun} Not Run</span>
              <span className="ml-auto font-medium">{progress.passRate}% pass rate</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${progress.passRate}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading...</div>
          ) : executions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No test cases in this suite.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  {!isViewer && (
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={allExecsSelected} onChange={toggleAllExecs} className="cursor-pointer" />
                    </th>
                  )}
                  {['', 'ID', 'Title', 'Priority', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {executions.map((exec) => {
                  const isExpanded = expandedExecId === exec.id
                  return (
                    <>
                      <tr
                        key={exec.id}
                        className={`border-t group cursor-pointer transition-colors ${
                          selectedExecIds.has(exec.id) ? 'bg-primary/5' : isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20'
                        }`}
                        onClick={() => setExpandedExecId(isExpanded ? null : exec.id)}
                      >
                        {!isViewer && (
                          <td className="px-3 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedExecIds.has(exec.id)}
                              onChange={() => toggleExec(exec.id)}
                              className="cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5 w-6">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          }
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{exec.testCase.tcId}</td>
                        <td className="px-4 py-2.5 min-w-0">
                          <span className="line-clamp-2 leading-snug text-sm" title={exec.testCase.title}>{exec.testCase.title}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{exec.testCase.priority}</td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {STATUS_ICONS[exec.status]}
                            <select
                              value={exec.status}
                              onChange={(e) => updateStatusMut.mutate({ execId: exec.id, status: e.target.value })}
                              className={`text-xs px-1.5 py-0.5 rounded-full border-0 font-medium focus:outline-none cursor-pointer ${STATUS_COLORS[exec.status]}`}
                            >
                              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onReportBug(exec.testCase.id)}
                            title="Report Bug for this TC"
                            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors opacity-0 group-hover:opacity-100 ${
                              exec.status === 'FAIL' || exec.status === 'BLOCKED'
                                ? 'border-red-700 text-red-400 hover:bg-red-900/30 !opacity-100'
                                : 'border-muted text-muted-foreground hover:bg-muted/40'
                            }`}
                          >
                            <Bug className="h-3 w-3" />
                            <span>Bug</span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <ExpandedRow
                          key={`expanded-${exec.id}`}
                          exec={exec}
                          colSpan={!isViewer ? 7 : 6}
                          onClose={() => setExpandedExecId(null)}
                        />
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center gap-2">
          {!isViewer && selectedExecIds.size > 0 && (
            <button
              onClick={() => setBulkRemoveConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove ({selectedExecIds.size})
            </button>
          )}
          {!runData?.completedAt && (
            <button
              onClick={() =>
                api.put(`/test-runs/${runId}/complete`).then(() => {
                  qc.invalidateQueries({ queryKey: ['test-runs'] })
                  qc.invalidateQueries({ queryKey: ['test-run', runId] })
                })
              }
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
            >
              Mark Complete
            </button>
          )}
        </div>
      </div>

      {bulkRemoveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border rounded-lg shadow-lg p-5 w-80">
            <p className="text-sm mb-4">
              Remove <span className="font-semibold">{selectedExecIds.size}</span> test case{selectedExecIds.size > 1 ? 's' : ''} from this suite? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBulkRemoveConfirm(false)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => bulkRemoveMut.mutate(Array.from(selectedExecIds))}
                disabled={bulkRemoveMut.isPending}
                className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function TestSuitesTab({ projectId }: { projectId: string }) {
  const isViewer = useIsViewer()
  const qc = useQueryClient()

  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [folderModal, setFolderModal] = useState<{
    open: boolean; editSuite: Suite | null; parentId: string | null
  }>({ open: false, editSuite: null, parentId: null })

  const [createOpen, setCreateOpen] = useState(false)
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [bugModal, setBugModal] = useState<{ open: boolean; tcId: string | null }>({ open: false, tcId: null })

  // Suites (folders) — RUN_FOLDER type only, separate from test-case folders
  const { data: suitesData } = useQuery({
    queryKey: ['suites', projectId, 'RUN_FOLDER'],
    queryFn: () => api.get('/suites', { params: { projectId, type: 'RUN_FOLDER' } }).then((r) => r.data.data),
  })
  const suites: Suite[] = suitesData ?? []

  const deleteSuiteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/suites/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suites', projectId, 'RUN_FOLDER'] }); setSelectedSuiteId(null) },
  })

  // Test Runs
  const { data: runsData, isLoading } = useQuery({
    queryKey: ['test-runs', projectId, selectedSuiteId],
    queryFn: () =>
      api.get('/test-runs', {
        params: {
          projectId,
          ...(selectedSuiteId !== null ? { suiteId: selectedSuiteId } : {}),
        },
      }).then((r) => r.data.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/test-runs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-runs'] }); setDeleteConfirm(null) },
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data.data as User[]),
  })

  const runs: TestRun[] = runsData ?? []
  const users: User[] = usersData ?? []

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Folder Tree ── */}
      <div className="w-52 border-r flex flex-col shrink-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Folders</span>
          {!isViewer && (
            <button
              onClick={() => setFolderModal({ open: true, editSuite: null, parentId: null })}
              title="New folder"
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
              selectedSuiteId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
            }`}
            onClick={() => setSelectedSuiteId(null)}
          >
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">All suites</span>
            <span className="text-xs text-muted-foreground">{runs.length || ''}</span>
          </div>
          {suites.map((s) => (
            <FolderNode
              key={s.id}
              suite={s}
              selectedId={selectedSuiteId}
              onSelect={setSelectedSuiteId}
              onAddChild={(parentId) => setFolderModal({ open: true, editSuite: null, parentId })}
              onRename={(suite) => setFolderModal({ open: true, editSuite: suite, parentId: null })}
              onDelete={(suite) => {
                if (suite._count.testCases > 0 || suite.children.length > 0) {
                  alert('Move test cases and subfolders first before deleting.')
                  return
                }
                deleteSuiteMut.mutate(suite.id)
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Right: Runs List ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <span className="text-sm font-medium text-muted-foreground">
            {selectedSuiteId
              ? suites.find((s) => s.id === selectedSuiteId)?.name ?? 'Folder'
              : 'All Test Suites'}
          </span>
          {!isViewer && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> New Suite
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No test suites yet. Create one to start tracking execution.
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="border rounded-lg p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{run.name}</span>
                      {run.suite && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Folder className="h-3 w-3" />{run.suite.name}
                        </span>
                      )}
                      {run.completedAt && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-900/60 text-green-300">
                          Completed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {run._count.executions} test cases · Created by {run.createdBy.name} ·{' '}
                      {new Date(run.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOpenRunId(run.id)}
                      className="px-3 py-1.5 text-xs border rounded-md hover:bg-muted"
                    >
                      Open
                    </button>
                    {!isViewer && (
                      <button
                        onClick={() => setDeleteConfirm(run.id)}
                        className="p-1.5 rounded border border-destructive/30 text-destructive hover:bg-destructive/5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Folder Modal */}
      {folderModal.open && (
        <FolderFormModal
          projectId={projectId}
          editSuite={folderModal.editSuite}
          parentId={folderModal.parentId}
          onClose={() => setFolderModal({ open: false, editSuite: null, parentId: null })}
        />
      )}

      {createOpen && (
        <CreateRunModal
          projectId={projectId}
          suites={suites}
          defaultSuiteId={selectedSuiteId}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {openRunId && (
        <SuiteDetailPanel
          runId={openRunId}
          projectId={projectId}
          onClose={() => setOpenRunId(null)}
          onReportBug={(tcId) => setBugModal({ open: true, tcId })}
        />
      )}

      {bugModal.open && (
        <BugFormModal
          projectId={projectId}
          defaultTestCaseId={bugModal.tcId}
          users={users}
          onClose={() => setBugModal({ open: false, tcId: null })}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border rounded-lg shadow-lg p-5 w-80">
            <p className="text-sm mb-4">Delete this test suite and all its execution data?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm)}
                disabled={deleteMut.isPending}
                className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
