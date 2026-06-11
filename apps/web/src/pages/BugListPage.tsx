import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ArrowLeft, Plus, X, Trash2, Search, Pencil, Link } from 'lucide-react'
import BugFormModal from '@/components/bug/BugFormModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bug {
  id: string
  bugId: string
  title: string
  steps: string[]
  attachment: string[]
  expectedResult: string
  actualResult: string
  severity: string
  priority: string
  type: string
  status: string
  projectId: string
  assigneeId: string | null
  assignee: { id: string; name: string } | null
  reporter: { id: string; name: string }
  testCaseId: string | null
  testCase: { id: string; tcId: string; title: string } | null
  createdAt: string
  updatedAt: string
}

interface User { id: string; name: string; email: string; role: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST']
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-900/60 text-red-300',
  HIGH: 'bg-orange-900/60 text-orange-300',
  MEDIUM: 'bg-yellow-900/60 text-yellow-300',
  LOW: 'bg-blue-900/60 text-blue-300',
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-900/60 text-red-300',
  IN_PROGRESS: 'bg-blue-900/60 text-blue-300',
  RESOLVED: 'bg-green-900/60 text-green-300',
  CLOSED: 'bg-muted text-muted-foreground',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', CLOSED: 'Closed',
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt="attachment"
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

// ─── Bug Detail Panel ─────────────────────────────────────────────────────────

function BugDetailPanel({ bug, onClose, onEdit, onDelete }: {
  bug: Bug
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const updateStatusMut = useMutation({
    mutationFn: (status: string) => api.put(`/bugs/${bug.id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'] }),
  })

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-xl bg-background border-l shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">{bug.bugId}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[bug.severity]}`}>
                {bug.severity}
              </span>
            </div>
            <h2 className="text-sm font-semibold leading-snug">{bug.title}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} title="Edit" className="p-1.5 rounded hover:bg-muted">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded hover:bg-destructive/20 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted ml-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Meta grid */}
          <div className="px-5 py-4 border-b grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <select
                value={bug.status}
                onChange={(e) => updateStatusMut.mutate(e.target.value)}
                className={`text-xs px-2 py-1 rounded-full border-0 font-medium focus:outline-none cursor-pointer ${STATUS_COLORS[bug.status]}`}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Priority</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[bug.priority] ?? 'bg-muted text-muted-foreground'}`}>
                {bug.priority}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Type</p>
              <span className="text-xs">{bug.type}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Assignee</p>
              <span className="text-xs">{bug.assignee?.name ?? <span className="italic text-muted-foreground">Unassigned</span>}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Reporter</p>
              <span className="text-xs">{bug.reporter.name}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Reported</p>
              <span className="text-xs">{new Date(bug.createdAt).toLocaleDateString()}</span>
            </div>

            {/* TC Linked — full width */}
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Link className="h-3 w-3" /> TC Linked
              </p>
              {bug.testCase ? (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">
                  <span className="font-mono">{bug.testCase.tcId}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="truncate max-w-xs">{bug.testCase.title}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground italic">Not linked</span>
              )}
            </div>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Steps */}
            {bug.steps?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Steps to Reproduce
                </p>
                <ol className="space-y-1">
                  {bug.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="grid gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Expected Result
                </p>
                <p className="text-sm bg-muted/30 rounded-md p-3 leading-relaxed">{bug.expectedResult}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Actual Result
                </p>
                <p className="text-sm bg-red-900/20 border border-red-900/30 rounded-md p-3 leading-relaxed text-red-200">
                  {bug.actualResult}
                </p>
              </div>
            </div>

            {bug.attachment?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Attachments
                </p>
                {/* Image thumbnails */}
                {bug.attachment.some((a) => a.startsWith('data:image/')) && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {bug.attachment.filter((a) => a.startsWith('data:image/')).map((src, i) => (
                      <button key={i} onClick={() => setLightboxSrc(src)} className="group relative">
                        <img
                          src={src}
                          alt={`attachment ${i + 1}`}
                          className="h-20 w-28 object-cover rounded-md border group-hover:opacity-80 transition-opacity"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">View</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* URL links */}
                <div className="space-y-1">
                  {bug.attachment.filter((a) => !a.startsWith('data:image/')).map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline block truncate">
                      {url}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirmModal({ bug, onConfirm, onCancel, isPending }: {
  bug: Bug; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold mb-2">Delete Bug</h3>
        <p className="text-sm text-muted-foreground mb-1">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{bug.bugId}</span>?
        </p>
        <p className="text-sm text-muted-foreground mb-5">
          "<span className="italic">{bug.title}</span>" will be permanently removed and cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm border rounded-md hover:bg-muted">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="px-4 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50">
            {isPending ? 'Deleting...' : 'Delete Bug'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BugListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedBug, setSelectedBug] = useState<Bug | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editBug, setEditBug] = useState<Bug | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Bug | null>(null)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data.data),
    enabled: !!projectId,
  })

  const { data: bugsData, isLoading } = useQuery({
    queryKey: ['bugs', projectId, search, filterStatus, filterSeverity, filterPriority],
    queryFn: () =>
      api.get('/bugs', {
        params: {
          projectId,
          ...(search && { search }),
          ...(filterStatus && { status: filterStatus }),
          ...(filterSeverity && { severity: filterSeverity }),
          ...(filterPriority && { priority: filterPriority }),
          limit: 200,
        },
      }).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data.data as User[]),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/bugs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs'] })
      setDeleteTarget(null)
      setSelectedBug(null)
    },
  })

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/bugs/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bugs'] }),
  })

  const bugs: Bug[] = bugsData?.data ?? []
  const users: User[] = usersData ?? []
  const hasFilters = search || filterStatus || filterSeverity || filterPriority

  function clearFilters() {
    setSearch(''); setFilterStatus(''); setFilterSeverity(''); setFilterPriority('')
  }

  function openCreate() { setEditBug(null); setFormOpen(true) }
  function openEdit(bug: Bug) { setSelectedBug(null); setEditBug(bug); setFormOpen(true) }

  useEffect(() => {
    if (selectedBug && bugs.length > 0) {
      const updated = bugs.find((b) => b.id === selectedBug.id)
      if (updated) setSelectedBug(updated)
    }
  }, [bugs])

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b flex items-center gap-3">
        <button onClick={() => navigate('/bugs')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Bugs
        </button>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="text-sm font-semibold">{projectData?.name ?? '...'}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{bugs.length} bugs</span>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Report Bug
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-2.5 border-b flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID or title..."
            className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-48 focus:outline-none focus:ring-1 focus:ring-primary bg-background" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
          <option value="">All status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
          className="border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
          <option value="">All severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
          className="border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background">
          <option value="">All priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : bugs.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {hasFilters ? 'No bugs match the filters.' : 'No bugs reported yet.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {['BUG-ID', 'Title', 'TC Linked', 'Severity', 'Priority', 'Assignee', 'Status', 'Reporter', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bugs.map((bug) => (
                <tr key={bug.id} onClick={() => setSelectedBug(bug)}
                  className={`border-t cursor-pointer group transition-colors ${
                    selectedBug?.id === bug.id ? 'bg-primary/5' : 'hover:bg-muted/20'
                  }`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {bug.bugId}
                  </td>
                  <td className="px-4 py-2.5 max-w-xs">
                    <span className="line-clamp-1 font-medium">{bug.title}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {bug.testCase ? (
                      <span className="text-xs font-mono text-primary">{bug.testCase.tcId}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[bug.severity]}`}>
                      {bug.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">{bug.priority}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {bug.assignee?.name ?? <span className="italic">—</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <select value={bug.status}
                      onChange={(e) => updateStatusMut.mutate({ id: bug.id, status: e.target.value })}
                      className={`text-xs px-2 py-0.5 rounded-full border-0 font-medium focus:outline-none cursor-pointer ${STATUS_COLORS[bug.status]}`}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {bug.reporter.name}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(bug)} className="p-1 rounded hover:bg-muted" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(bug)}
                        className="p-1 rounded hover:bg-destructive/20 text-destructive" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedBug && (
        <BugDetailPanel bug={selectedBug} onClose={() => setSelectedBug(null)}
          onEdit={() => openEdit(selectedBug)}
          onDelete={() => setDeleteTarget(selectedBug)} />
      )}

      {formOpen && (
        <BugFormModal
          projectId={projectId!}
          editBug={editBug}
          users={users}
          onClose={() => { setFormOpen(false); setEditBug(null) }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal bug={deleteTarget}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMut.isPending} />
      )}
    </div>
  )
}
