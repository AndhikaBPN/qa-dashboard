import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Filter, X } from 'lucide-react'

interface Project { id: string; name: string }
interface TestRun {
  id: string
  name: string
  projectId: string | null
  project: { id: string; name: string } | null
  suite: { id: string; name: string } | null
  completedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  _count: { executions: number }
}

export default function TestRunsPage() {
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilter = projectFilter || statusFilter || fromFilter || toFilter

  const { data, isLoading } = useQuery({
    queryKey: ['test-runs-global', projectFilter, statusFilter, fromFilter, toFilter],
    queryFn: () =>
      api
        .get('/test-runs', {
          params: {
            ...(projectFilter ? { projectId: projectFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(fromFilter ? { from: fromFilter } : {}),
            ...(toFilter ? { to: toFilter } : {}),
          },
        })
        .then((r) => r.data.data as TestRun[]),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((r) => r.data.data as Project[]),
  })

  const runs: TestRun[] = data ?? []
  const projects: Project[] = projectsData ?? []

  function clearFilters() {
    setProjectFilter('')
    setStatusFilter('')
    setFromFilter('')
    setToFilter('')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">Test Runs</h1>
        <div className="flex items-center gap-2">
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-md transition-colors ${
              showFilters || hasActiveFilter
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {hasActiveFilter && (
              <span className="ml-0.5 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none">
                {[projectFilter, statusFilter, fromFilter, toFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-5 p-4 border rounded-lg bg-muted/20">
          {/* Project */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All statuses</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Created from</label>
            <input
              type="date"
              value={fromFilter}
              onChange={(e) => setFromFilter(e.target.value)}
              className="border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Created to</label>
            <input
              type="date"
              value={toFilter}
              onChange={(e) => setToFilter(e.target.value)}
              className="border rounded-md px-2.5 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground border rounded-lg">
          {hasActiveFilter ? 'No test runs match the filters.' : 'No test runs yet.'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Name', 'Project', 'Suite', 'Created By', 'TCs', 'Status', 'Created At'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{run.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {run.project?.name ?? <span className="italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {run.suite?.name ?? <span className="italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{run.createdBy?.name}</td>
                  <td className="px-4 py-2.5 text-center">{run._count?.executions ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        run.completedAt
                          ? 'bg-green-900/60 text-green-300'
                          : 'bg-blue-900/60 text-blue-300'
                      }`}
                    >
                      {run.completedAt ? 'Completed' : 'In Progress'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {new Date(run.createdAt).toLocaleDateString('id-ID', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
