import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { X, Plus } from 'lucide-react'

export interface BugFormBug {
  id: string
  title: string
  steps: string[]
  attachment: string[]
  expectedResult: string
  actualResult: string
  severity: string
  priority: string
  type: string
  status: string
  assigneeId: string | null
  testCaseId: string | null
}

interface User {
  id: string
  name: string
}

interface TestCase {
  id: string
  tcId: string
  title: string
}

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST']
const TYPES = ['FUNCTIONAL', 'UI', 'PERFORMANCE', 'SECURITY', 'API', 'INTEGRATION', 'OTHER']
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', CLOSED: 'Closed',
}

interface Props {
  projectId: string
  editBug?: BugFormBug | null
  defaultTestCaseId?: string | null
  users: User[]
  onClose: () => void
}

export default function BugFormModal({ projectId, editBug, defaultTestCaseId, users, onClose }: Props) {
  const qc = useQueryClient()

  const [form, setForm] = useState({
    title: editBug?.title ?? '',
    expectedResult: editBug?.expectedResult ?? '',
    actualResult: editBug?.actualResult ?? '',
    severity: editBug?.severity ?? 'HIGH',
    priority: editBug?.priority ?? 'HIGH',
    type: editBug?.type ?? 'FUNCTIONAL',
    status: editBug?.status ?? 'OPEN',
    assigneeId: editBug?.assigneeId ?? '',
    testCaseId: editBug?.testCaseId ?? defaultTestCaseId ?? '',
  })
  const [steps, setSteps] = useState<string[]>(
    editBug?.steps?.length ? editBug.steps : ['']
  )
  const [attachments, setAttachments] = useState<string[]>(
    editBug?.attachment?.length ? editBug.attachment : []
  )

  const { data: tcData } = useQuery({
    queryKey: ['test-cases-bug-picker', projectId],
    queryFn: () =>
      api.get('/test-cases', { params: { projectId, limit: 200 } }).then((r) => r.data.data as TestCase[]),
  })

  const testCases: TestCase[] = tcData ?? []

  const createMut = useMutation({
    mutationFn: (body: any) => api.post('/bugs', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bugs'] }); onClose() },
  })
  const updateMut = useMutation({
    mutationFn: (body: any) => api.put(`/bugs/${editBug!.id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bugs'] }); onClose() },
  })

  function addStep() { setSteps((s) => [...s, '']) }
  function removeStep(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, v: string) { setSteps((s) => s.map((x, idx) => (idx === i ? v : x))) }
  function addAttachment() { setAttachments((a) => [...a, '']) }
  function removeAttachment(i: number) { setAttachments((a) => a.filter((_, idx) => idx !== i)) }
  function updateAttachment(i: number, v: string) { setAttachments((a) => a.map((x, idx) => (idx === i ? v : x))) }

  function submit() {
    const payload = {
      ...form,
      projectId,
      steps: steps.filter((s) => s.trim()),
      attachment: attachments.filter((a) => a.trim()),
      assigneeId: form.assigneeId || null,
      testCaseId: form.testCaseId || null,
    }
    if (editBug) updateMut.mutate(payload)
    else createMut.mutate(payload)
  }

  const canSubmit = form.title.trim() && form.expectedResult.trim() && form.actualResult.trim()
  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">{editBug ? 'Edit Bug' : 'Report New Bug'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium mb-1 block">Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              placeholder="Brief description of the bug"
            />
          </div>

          {/* TC Linked */}
          <div>
            <label className="text-xs font-medium mb-1 block">TC Linked</label>
            <select
              value={form.testCaseId}
              onChange={(e) => setForm((f) => ({ ...f, testCaseId: e.target.value }))}
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            >
              <option value="">— Not linked to a test case —</option>
              {testCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.tcId} — {tc.title}
                </option>
              ))}
            </select>
          </div>

          {/* Severity / Priority / Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Severity *</label>
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
                {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Priority *</label>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Type *</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Status + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Assignee</label>
              <select value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
                <option value="">— Unassigned —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Steps to Reproduce</label>
              <button onClick={addStep} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add Step
              </button>
            </div>
            <div className="space-y-1.5">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
                  <input
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                    className="flex-1 border rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                    placeholder={`Step ${i + 1}`}
                  />
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
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
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background resize-none"
              rows={2}
              placeholder="What should happen"
            />
          </div>

          {/* Actual Result */}
          <div>
            <label className="text-xs font-medium mb-1 block">Actual Result *</label>
            <textarea
              value={form.actualResult}
              onChange={(e) => setForm((f) => ({ ...f, actualResult: e.target.value }))}
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background resize-none"
              rows={2}
              placeholder="What actually happened"
            />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Attachments (URLs)</label>
              <button onClick={addAttachment} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add URL
              </button>
            </div>
            <div className="space-y-1.5">
              {attachments.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={url}
                    onChange={(e) => updateAttachment(i, e.target.value)}
                    className="flex-1 border rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                    placeholder="https://..."
                  />
                  <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {attachments.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No attachments</p>
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
            disabled={!canSubmit || isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {editBug ? 'Save Changes' : 'Report Bug'}
          </button>
        </div>
      </div>
    </div>
  )
}
