import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/projectStore'

interface Project {
  id: string
  name: string
  description?: string
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
  _count: { testSuites: number; testCases: number; testRuns: number }
}

interface FormState {
  name: string
  description: string
  status: 'ACTIVE' | 'ARCHIVED'
}

const emptyForm: FormState = { name: '', description: '', status: 'ACTIVE' }

export default function ProjectsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ data: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (body: FormState) => api.post('/projects', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); closeForm() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FormState> }) =>
      api.put(`/projects/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); closeForm() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      if (selectedProjectId === id) setSelectedProjectId(null)
      setDeleteConfirm(null)
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({ name: p.name, description: p.description ?? '', status: p.status })
    setOpen(true)
  }

  function closeForm() {
    setOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function submit() {
    if (!form.name.trim()) return
    if (editing) {
      updateMut.mutate({ id: editing.id, body: form })
    } else {
      createMut.mutate(form)
    }
  }

  const projects = data?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + New Project
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No projects yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-muted/30 hover:border-primary/40"
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      p.status === 'ACTIVE'
                        ? 'bg-green-900/60 text-green-300'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
                )}
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{p._count.testSuites} suites</span>
                  <span>{p._count.testCases} test cases</span>
                  <span>{p._count.testRuns} runs</span>
                </div>
              </div>
              <div className="flex gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => openEdit(p)}
                  className="text-xs px-2 py-1 rounded border hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirm(p.id)}
                  className="text-xs px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/5"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-base font-semibold mb-4">
              {editing ? 'Edit Project' : 'New Project'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Project name"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'ARCHIVED' }))
                  }
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={closeForm}
                className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!form.name.trim() || createMut.isPending || updateMut.isPending}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold mb-2">Delete Project</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This will permanently delete the project. Suites and test cases must be removed first.
            </p>
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
