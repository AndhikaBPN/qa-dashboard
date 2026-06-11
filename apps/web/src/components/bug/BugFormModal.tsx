import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { X, Plus, Clipboard, Image, Link } from 'lucide-react'

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

interface User { id: string; name: string }
interface TestCase { id: string; tcId: string; title: string }

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

function isDataUrl(s: string) { return s.startsWith('data:image/') }
function isHttpUrl(s: string) { return s.startsWith('http://') || s.startsWith('https://') }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function BugFormModal({ projectId, editBug, defaultTestCaseId, users, onClose }: Props) {
  const qc = useQueryClient()
  const modalRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

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
  const [urlInput, setUrlInput] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

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

  // Global paste listener on modal — capture image from clipboard
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue
          const dataUrl = await readFileAsDataUrl(file)
          setAttachments((a) => [...a, dataUrl])
        }
      }
    }
    el.addEventListener('paste', handlePaste)
    return () => el.removeEventListener('paste', handlePaste)
  }, [])

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file)
      setAttachments((a) => [...a, dataUrl])
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file)
      setAttachments((a) => [...a, dataUrl])
    }
    e.target.value = ''
  }

  function addUrlAttachment() {
    const url = urlInput.trim()
    if (!url) return
    setAttachments((a) => [...a, url])
    setUrlInput('')
  }

  function removeAttachment(i: number) { setAttachments((a) => a.filter((_, idx) => idx !== i)) }

  function addStep() { setSteps((s) => [...s, '']) }
  function removeStep(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, v: string) { setSteps((s) => s.map((x, idx) => (idx === i ? v : x))) }

  function submit() {
    const payload = {
      ...form,
      projectId,
      steps: steps.filter((s) => s.trim()),
      attachment: attachments,
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
      <div ref={modalRef} className="bg-background border rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" tabIndex={-1}>
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
                <option key={tc.id} value={tc.id}>{tc.tcId} — {tc.title}</option>
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
            <label className="text-xs font-medium mb-2 block">Attachments</label>

            {/* Paste / Drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer mb-3 ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/40 hover:bg-muted/20'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clipboard className="h-4 w-4" />
                  <Image className="h-4 w-4" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste screenshot <kbd className="px-1 py-0.5 text-[10px] border rounded bg-muted font-mono">Ctrl+V</kbd>
                  {' '}· drag & drop · or click to browse
                </p>
              </div>
            </div>

            {/* Thumbnail grid for image attachments */}
            {attachments.filter(isDataUrl).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((att, i) =>
                  isDataUrl(att) ? (
                    <div key={i} className="relative group">
                      <button onClick={() => setLightboxSrc(att)} className="block">
                        <img
                          src={att}
                          alt={`attachment ${i + 1}`}
                          className="h-20 w-28 object-cover rounded-md border group-hover:opacity-80 transition-opacity"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">View</span>
                        </div>
                      </button>
                      <button
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* URL attachments */}
            <div className="space-y-1.5">
              {attachments.map((att, i) =>
                isHttpUrl(att) ? (
                  <div key={i} className="flex items-center gap-2">
                    <Link className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs text-primary truncate">{att}</span>
                    <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null
              )}
            </div>

            {/* Add URL input */}
            <div className="flex items-center gap-2 mt-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addUrlAttachment()}
                placeholder="Or paste a URL and press Enter…"
                className="flex-1 border rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
              <button
                onClick={addUrlAttachment}
                disabled={!urlInput.trim()}
                className="px-2.5 py-1 text-xs border rounded-md hover:bg-muted disabled:opacity-40 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
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

      {/* Lightbox */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  )
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt="attachment preview"
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-background border rounded-full p-1.5 shadow-lg hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
