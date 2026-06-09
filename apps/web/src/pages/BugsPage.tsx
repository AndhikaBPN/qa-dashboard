import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Bug } from 'lucide-react'

interface ProjectBugSummary {
  projectId: string
  projectName: string
  projectStatus: 'ACTIVE' | 'ARCHIVED'
  description?: string
  open: number
  inProgress: number
  resolved: number
  closed: number
  total: number
}

const STATUS_DOT: Record<string, string> = {
  open: 'bg-red-400',
  inProgress: 'bg-blue-400',
  resolved: 'bg-green-400',
  closed: 'bg-muted-foreground',
}

export default function BugsPage() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<ProjectBugSummary[]>({
    queryKey: ['bug-summary'],
    queryFn: () => api.get('/reports/bug-summary').then((r) => r.data.data),
    refetchInterval: 30_000,
  })

  const projects = data ?? []
  const globalTotal = projects.reduce((sum, p) => sum + p.total, 0)
  const globalOpen = projects.reduce((sum, p) => sum + p.open, 0)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Bug className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Bug Tracker</h1>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {globalTotal} total bugs · {globalOpen} open
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No projects found.</div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div
              key={p.projectId}
              onClick={() => navigate(`/bugs/${p.projectId}`)}
              className="border rounded-lg p-5 cursor-pointer hover:border-primary/40 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{p.projectName}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        p.projectStatus === 'ACTIVE'
                          ? 'bg-green-900/60 text-green-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {p.projectStatus}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Bug className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">{p.total}</span>
                  {p.open > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-300">
                      {p.open} open
                    </span>
                  )}
                </div>
              </div>

              {p.total > 0 ? (
                <div className="mt-4">
                  <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-2">
                    {p.open > 0 && (
                      <div className="bg-red-400" style={{ width: `${(p.open / p.total) * 100}%` }} />
                    )}
                    {p.inProgress > 0 && (
                      <div className="bg-blue-400" style={{ width: `${(p.inProgress / p.total) * 100}%` }} />
                    )}
                    {p.resolved > 0 && (
                      <div className="bg-green-400" style={{ width: `${(p.resolved / p.total) * 100}%` }} />
                    )}
                    {p.closed > 0 && (
                      <div className="bg-muted-foreground/40" style={{ width: `${(p.closed / p.total) * 100}%` }} />
                    )}
                  </div>

                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {(
                      [
                        ['open', 'Open', p.open],
                        ['inProgress', 'In Progress', p.inProgress],
                        ['resolved', 'Resolved', p.resolved],
                        ['closed', 'Closed', p.closed],
                      ] as const
                    ).map(([key, label, count]) => (
                      <span key={key} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[key]}`} />
                        {count} {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2 italic">No bugs reported</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
