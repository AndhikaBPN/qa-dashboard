import { useState, useEffect, useRef } from 'react'
import { useIsViewer } from '@/stores/authStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import * as XLSX from 'xlsx'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  Plus, Pencil, Trash2, Search, X, Upload, CheckCircle2, AlertCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Suite {
  id: string
  name: string
  parentId: string | null
  orderIndex: number
  children: Suite[]
  _count: { testCases: number }
}

interface TestCase {
  id: string
  tcId: string
  title: string
  priority: string
  type: string
  scenarioType: string
  suiteId: string | null
  suite: { id: string; name: string } | null
  author: { id: string; name: string }
}

interface Step {
  order: number
  action: string
  testData: string
  expectedStepResult: string
}

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST']
const TYPES = ['UNIT', 'INTEGRATION', 'FUNCTIONAL', 'PERFORMANCE', 'API', 'SECURITY']
const SCENARIOS = ['POSITIVE', 'NEGATIVE', 'EDGE_CASE']

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-900/60 text-red-300',
  HIGH: 'bg-orange-900/60 text-orange-300',
  MEDIUM: 'bg-yellow-900/60 text-yellow-300',
  LOW: 'bg-blue-900/60 text-blue-300',
  LOWEST: 'bg-muted text-muted-foreground',
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(suites: any[]): Suite[] {
  const map = new Map(suites.map((s) => [s.id, { ...s, children: [] as Suite[] }]))
  const roots: Suite[] = []
  for (const node of map.values()) {
    if (node.parentId) (map.get(node.parentId) as any)?.children.push(node)
    else roots.push(node as Suite)
  }
  return roots.sort((a, b) => a.orderIndex - b.orderIndex)
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
  const isViewer = useIsViewer()
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
        <span className="text-xs text-muted-foreground mr-1">{suite._count.testCases}</span>
        {hovered && !isViewer && (
          <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              title="Add subfolder"
              onClick={() => onAddChild(suite.id)}
              className="p-0.5 rounded hover:bg-muted"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              title="Rename"
              onClick={() => onRename(suite)}
              className="p-0.5 rounded hover:bg-muted"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              title="Delete"
              onClick={() => onDelete(suite)}
              className="p-0.5 rounded hover:bg-destructive/20 text-destructive"
            >
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
      createMut.mutate({
        name,
        projectId,
        type: 'CASE_FOLDER',
        ...(parentId ? { parentId } : {}),
      })
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
          className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Folder name"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
            Cancel
          </button>
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

// ─── TC Form Modal ────────────────────────────────────────────────────────────

function TcFormModal({
  projectId, suites, editId, defaultSuiteId, onClose,
}: {
  projectId: string
  suites: Suite[]
  editId: string | null
  defaultSuiteId: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()

  const { data: existing, isLoading: loadingEdit } = useQuery({
    queryKey: ['test-case', editId],
    queryFn: () => api.get(`/test-cases/${editId}`).then((r) => r.data.data),
    enabled: !!editId,
  })

  const [form, setForm] = useState({
    title: '',
    precondition: '',
    expectedResult: '',
    priority: 'MEDIUM',
    type: 'FUNCTIONAL',
    scenarioType: 'POSITIVE',
    suiteId: defaultSuiteId ?? '',
    jiraIssueKey: '',
  })
  const [steps, setSteps] = useState<Step[]>([
    { order: 1, action: '', testData: '', expectedStepResult: '' },
  ])

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        precondition: existing.precondition ?? '',
        expectedResult: existing.expectedResult,
        priority: existing.priority,
        type: existing.type,
        scenarioType: existing.scenarioType,
        suiteId: existing.suiteId ?? '',
        jiraIssueKey: existing.jiraIssueKey ?? '',
      })
      setSteps(
        Array.isArray(existing.steps) && existing.steps.length > 0
          ? existing.steps
          : [{ order: 1, action: '', testData: '', expectedStepResult: '' }]
      )
    }
  }, [existing])

  const createMut = useMutation({
    mutationFn: (body: any) => api.post('/test-cases', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-cases'] }); onClose() },
  })

  const updateMut = useMutation({
    mutationFn: (body: any) => api.put(`/test-cases/${editId}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-cases'] }); onClose() },
  })

  function addStep() {
    setSteps((s) => [
      ...s,
      { order: s.length + 1, action: '', testData: '', expectedStepResult: '' },
    ])
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx).map((step, i) => ({ ...step, order: i + 1 })))
  }

  function updateStep(idx: number, field: keyof Step, value: string) {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, [field]: value } : step)))
  }

  function submit() {
    const payload = {
      ...form,
      suiteId: form.suiteId || undefined,
      jiraIssueKey: form.jiraIssueKey || undefined,
      precondition: form.precondition || undefined,
      projectId,
      steps,
    }
    if (editId) {
      updateMut.mutate(payload)
    } else {
      createMut.mutate(payload)
    }
  }

  const isPending = createMut.isPending || updateMut.isPending
  const canSubmit = form.title.trim() && form.expectedResult.trim() && steps.every((s) => s.action.trim())

  function flattenSuites(suites: Suite[], depth = 0): { id: string; label: string }[] {
    return suites.flatMap((s) => [
      { id: s.id, label: `${'— '.repeat(depth)}${s.name}` },
      ...flattenSuites(s.children, depth + 1),
    ])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">{editId ? 'Edit Test Case' : 'New Test Case'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingEdit ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-y-auto p-5 space-y-4 flex-1">
            {/* Title */}
            <div>
              <label className="text-xs font-medium mb-1 block">Title *</label>
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Test case title"
              />
            </div>

            {/* Folder */}
            <div>
              <label className="text-xs font-medium mb-1 block">Folder</label>
              <select
                value={form.suiteId}
                onChange={(e) => setForm((f) => ({ ...f, suiteId: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— No folder —</option>
                {flattenSuites(suites).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority / Type / Scenario */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Priority *</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Scenario *</label>
                <select
                  value={form.scenarioType}
                  onChange={(e) => setForm((f) => ({ ...f, scenarioType: e.target.value }))}
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {SCENARIOS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Precondition */}
            <div>
              <label className="text-xs font-medium mb-1 block">Precondition</label>
              <textarea
                value={form.precondition}
                onChange={(e) => setForm((f) => ({ ...f, precondition: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={2}
                placeholder="Preconditions before test execution"
              />
            </div>

            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium">Steps *</label>
                <button
                  onClick={addStep}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Step
                </button>
              </div>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Step {idx + 1}</span>
                      {steps.length > 1 && (
                        <button
                          onClick={() => removeStep(idx)}
                          className="text-destructive hover:opacity-70"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      value={step.action}
                      onChange={(e) => updateStep(idx, 'action', e.target.value)}
                      className="w-full border rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Action *"
                    />
                    <input
                      value={step.testData}
                      onChange={(e) => updateStep(idx, 'testData', e.target.value)}
                      className="w-full border rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Test data (optional)"
                    />
                    <input
                      value={step.expectedStepResult}
                      onChange={(e) => updateStep(idx, 'expectedStepResult', e.target.value)}
                      className="w-full border rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Expected result for this step (optional)"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Expected Result */}
            <div>
              <label className="text-xs font-medium mb-1 block">Expected Result *</label>
              <textarea
                value={form.expectedResult}
                onChange={(e) => setForm((f) => ({ ...f, expectedResult: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={2}
                placeholder="Overall expected result"
              />
            </div>

            {/* Jira */}
            <div>
              <label className="text-xs font-medium mb-1 block">Jira Issue Key</label>
              <input
                value={form.jiraIssueKey}
                onChange={(e) => setForm((f) => ({ ...f, jiraIssueKey: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g. AUTH-142"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {editId ? 'Save Changes' : 'Create Test Case'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

type ImportStep = 'upload' | 'folder'

interface ParsedPreview {
  fileName: string
  rowCount: number
  columns: string[]
  raw: File
}

function FolderPickerNode({
  suite, selectedId, onSelect, depth = 0,
}: {
  suite: Suite
  selectedId: string | null
  onSelect: (id: string | null) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded-md cursor-pointer text-sm py-1 transition-colors ${
          selectedId === suite.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onSelect(suite.id)}
      >
        <button
          className="w-4 h-4 flex items-center justify-center shrink-0"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        >
          {suite.children.length > 0
            ? expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            : <span className="w-3" />}
        </button>
        <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
        <span className="flex-1 truncate">{suite.name}</span>
        <span className="text-xs text-muted-foreground mr-2">{suite._count.testCases}</span>
      </div>
      {expanded && suite.children.map((c) => (
        <FolderPickerNode key={c.id} suite={c} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  )
}

function ImportModal({ projectId, suites, onClose }: {
  projectId: string
  suites: Suite[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ImportStep>('upload')
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; errorCount: number; jobId: string } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  function handleFile(file: File) {
    setParseError(null)
    if (!file.name.match(/\.xlsx?$/i)) {
      setParseError('Only .xlsx files supported')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        const cols = rows.length > 0 ? Object.keys(rows[0]) : []
        setPreview({ fileName: file.name, rowCount: rows.length, columns: cols, raw: file })
      } catch {
        setParseError('Failed to parse file. Ensure it is a valid .xlsx file.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function downloadTemplate() {
    const template = [
      { Title: 'Example test case', Priority: 'MEDIUM', Type: 'FUNCTIONAL', Precondition: '', Steps: 'Click the button', 'Test Data': '', 'Expected Result': 'System behaves correctly', 'Scenario Type': 'POSITIVE', 'Jira Issue Key': '' },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(template), 'Test Cases')
    XLSX.writeFile(wb, 'import-template.xlsx')
  }

  async function doImport() {
    if (!preview) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', preview.raw)
      fd.append('projectId', projectId)
      if (selectedSuiteId) fd.append('suiteId', selectedSuiteId)
      const res = await api.post('/test-cases/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data.data)
      qc.invalidateQueries({ queryKey: ['test-cases'] })
      qc.invalidateQueries({ queryKey: ['suites'] })
    } catch {
      setParseError('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  function flattenSuites(list: Suite[]): { id: string; name: string }[] {
    return list.flatMap((s) => [{ id: s.id, name: s.name }, ...flattenSuites(s.children)])
  }

  const selectedSuiteName = selectedSuiteId
    ? flattenSuites(suites).find((s) => s.id === selectedSuiteId)?.name
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold">Import Test Cases</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === 'upload' ? 'Upload an .xlsx file' : 'Choose target folder'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {result ? (
            /* ── Success state ── */
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="text-sm font-semibold mb-1">Import completed</p>
              <p className="text-sm text-muted-foreground">
                {result.imported} test case{result.imported !== 1 ? 's' : ''} imported
                {result.errorCount > 0 && `, ${result.errorCount} row${result.errorCount !== 1 ? 's' : ''} skipped`}
              </p>
              <div className="flex gap-2 justify-center mt-5">
                <button
                  onClick={() => navigate('/import-jobs')}
                  className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
                >
                  View Import Jobs
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Done
                </button>
              </div>
            </div>
          ) : step === 'upload' ? (
            /* ── Step 1: Upload ── */
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f) handleFile(f)
                }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or <span className="text-primary underline">browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">Only .xlsx files</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>

              {parseError && (
                <div className="flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {parseError}
                </div>
              )}

              {preview && (
                <div className="border rounded-md p-3 bg-muted/20 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    <span className="font-medium truncate">{preview.fileName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    {preview.rowCount} row{preview.rowCount !== 1 ? 's' : ''} · Columns: {preview.columns.join(', ')}
                  </p>
                </div>
              )}

              <button
                onClick={downloadTemplate}
                className="text-xs text-primary underline hover:no-underline"
              >
                Download template
              </button>
            </div>
          ) : (
            /* ── Step 2: Folder picker ── */
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select a folder to import into, or leave unselected to import without folder.
              </p>
              <div className="border rounded-md overflow-hidden">
                <div
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    selectedSuiteId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedSuiteId(null)}
                >
                  — No folder (root)
                </div>
                <div className="border-t max-h-56 overflow-y-auto py-1 px-1">
                  {suites.map((s) => (
                    <FolderPickerNode
                      key={s.id}
                      suite={s}
                      selectedId={selectedSuiteId}
                      onSelect={setSelectedSuiteId}
                    />
                  ))}
                </div>
              </div>
              {selectedSuiteName && (
                <p className="text-xs text-muted-foreground">
                  Will import into: <span className="font-medium text-foreground">{selectedSuiteName}</span>
                </p>
              )}
              {parseError && (
                <div className="flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {parseError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex justify-between items-center px-5 py-4 border-t">
            <div>
              {step === 'folder' && (
                <button
                  onClick={() => setStep('upload')}
                  className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
                Cancel
              </button>
              {step === 'upload' ? (
                <button
                  disabled={!preview}
                  onClick={() => preview && setStep('folder')}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  disabled={importing}
                  onClick={doImport}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing ? 'Importing…' : `Import ${preview?.rowCount ?? ''} rows`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function TestCasesTab({ projectId }: { projectId: string }) {
  const isViewer = useIsViewer()
  const qc = useQueryClient()

  // Folder state
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [folderModal, setFolderModal] = useState<{
    open: boolean; editSuite: Suite | null; parentId: string | null
  }>({ open: false, editSuite: null, parentId: null })

  // TC state
  const [tcModal, setTcModal] = useState<{ open: boolean; editId: string | null }>({
    open: false, editId: null,
  })
  const [importOpen, setImportOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterScenario, setFilterScenario] = useState('')

  // Queries
  const { data: suitesData } = useQuery({
    queryKey: ['suites', projectId, 'CASE_FOLDER'],
    queryFn: () => api.get('/suites', { params: { projectId, type: 'CASE_FOLDER' } }).then((r) => r.data.data),
  })

  const suites: Suite[] = suitesData ?? []

  const { data: tcData, isLoading: tcLoading } = useQuery({
    queryKey: ['test-cases', projectId, selectedSuiteId, search, filterPriority, filterType, filterScenario],
    queryFn: () =>
      api
        .get('/test-cases', {
          params: {
            projectId,
            ...(selectedSuiteId && { suiteId: selectedSuiteId }),
            ...(search && { search }),
            ...(filterPriority && { priority: filterPriority }),
            ...(filterType && { type: filterType }),
            ...(filterScenario && { scenarioType: filterScenario }),
            limit: 100,
          },
        })
        .then((r) => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/test-cases/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-cases'] }); setDeleteConfirm(null) },
  })

  const deleteSuiteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/suites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suites', projectId, 'CASE_FOLDER'] })
      setSelectedSuiteId(null)
    },
  })

  const testCases: TestCase[] = tcData?.data ?? []
  const hasFilters = search || filterPriority || filterType || filterScenario

  function clearFilters() {
    setSearch('')
    setFilterPriority('')
    setFilterType('')
    setFilterScenario('')
  }

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
          {/* All */}
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
              selectedSuiteId === null ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
            }`}
            onClick={() => setSelectedSuiteId(null)}
          >
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">All test cases</span>
            <span className="text-xs text-muted-foreground">{tcData?.meta?.total ?? ''}</span>
          </div>
          {suites.map((s) => (
            <FolderNode
              key={s.id}
              suite={s}
              selectedId={selectedSuiteId}
              onSelect={setSelectedSuiteId}
              onAddChild={(parentId) =>
                setFolderModal({ open: true, editSuite: null, parentId })
              }
              onRename={(suite) =>
                setFolderModal({ open: true, editSuite: suite, parentId: null })
              }
              onDelete={(suite) => {
                if (
                  suite._count.testCases > 0 ||
                  suite.children.length > 0
                ) {
                  alert('Move test cases and subfolders first before deleting.')
                  return
                }
                deleteSuiteMut.mutate(suite.id)
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Right: TC List ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filter Bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID or title..."
              className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-52 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Priority */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Scenario */}
          <select
            value={filterScenario}
            onChange={(e) => setFilterScenario(e.target.value)}
            className="border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All scenarios</option>
            {SCENARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}

          <div className="flex-1" />
          {!isViewer && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
          )}
          {!isViewer && (
            <button
              onClick={() => setTcModal({ open: true, editId: null })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> New Test Case
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {tcLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading...</div>
          ) : testCases.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {hasFilters ? 'No test cases match the filters.' : 'No test cases yet. Create one to get started.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  {['ID', 'Title', 'Folder', 'Priority', 'Type', 'Scenario', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testCases.map((tc) => (
                  <tr
                    key={tc.id}
                    className="border-t hover:bg-muted/20 group"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{tc.tcId}</td>
                    <td className="px-4 py-2.5 font-medium max-w-xs">
                      <span className="line-clamp-1">{tc.title}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {tc.suite?.name ?? <span className="italic">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[tc.priority] ?? ''}`}>
                        {tc.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{tc.type}</td>
                    <td className="px-4 py-2.5 text-xs">{tc.scenarioType}</td>
                    <td className="px-4 py-2.5">
                      {!isViewer && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button
                            onClick={() => setTcModal({ open: true, editId: tc.id })}
                            className="p-1 rounded hover:bg-muted"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(tc.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* TC Form Modal */}
      {tcModal.open && (
        <TcFormModal
          projectId={projectId}
          suites={suites}
          editId={tcModal.editId}
          defaultSuiteId={selectedSuiteId}
          onClose={() => setTcModal({ open: false, editId: null })}
        />
      )}

      {/* Import Modal */}
      {importOpen && (
        <ImportModal
          projectId={projectId}
          suites={suites}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Delete TC Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border rounded-lg shadow-lg p-5 w-80">
            <p className="text-sm mb-4">Delete this test case? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
              >
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
