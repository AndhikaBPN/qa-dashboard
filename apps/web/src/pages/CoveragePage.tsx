import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'

interface ProjectCoverage {
  projectId: string
  projectName: string
  projectStatus: 'ACTIVE' | 'ARCHIVED'
  total: number
  pass: number
  fail: number
  skip: number
  bugs: number
  todo: number
  executed: number
  passRate: number
  coverage: number
}

const STAT_CONFIGS = [
  { key: 'total',   label: 'Total',   color: 'text-foreground',         dot: 'bg-muted-foreground' },
  { key: 'pass',    label: 'Passed',  color: 'text-green-400',           dot: 'bg-green-400' },
  { key: 'fail',    label: 'Failed',  color: 'text-red-400',             dot: 'bg-red-400' },
  { key: 'skip',    label: 'Skipped', color: 'text-muted-foreground',    dot: 'bg-muted-foreground' },
  { key: 'todo',    label: 'Todo',    color: 'text-blue-400',            dot: 'bg-blue-400' },
  { key: 'bugs',    label: 'Bugs',    color: 'text-orange-400',          dot: 'bg-orange-400' },
] as const

function CoverageRing({ passRate, coverage }: { passRate: number; coverage: number }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const passOffset = circ - (passRate / 100) * circ

  return (
    <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
        {/* Track */}
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        {/* Pass rate arc */}
        <circle
          cx="36" cy="36" r={r}
          fill="none" strokeWidth="7"
          stroke="hsl(var(--primary))"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={passOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-tight">
        <span className="text-sm font-bold text-foreground">{passRate}%</span>
        <span className="text-[9px] text-muted-foreground">pass</span>
      </div>
    </div>
  )
}

function CoverageBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function CoveragePage() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<ProjectCoverage[]>({
    queryKey: ['project-coverage'],
    queryFn: () => api.get('/reports/project-coverage').then((r) => r.data.data),
    refetchInterval: 30_000,
  })

  const projects = data ?? []

  const totals = projects.reduce(
    (acc, p) => ({
      total: acc.total + p.total,
      pass: acc.pass + p.pass,
      fail: acc.fail + p.fail,
      skip: acc.skip + p.skip,
      todo: acc.todo + p.todo,
      bugs: acc.bugs + p.bugs,
    }),
    { total: 0, pass: 0, fail: 0, skip: 0, todo: 0, bugs: 0 }
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Test Coverage</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Pass rate & execution progress per project</p>
      </div>

      {/* Global summary bar */}
      {projects.length > 0 && (
        <div className="border rounded-lg p-4 mb-6 bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">All Projects</p>
          <div className="grid grid-cols-6 gap-4">
            {STAT_CONFIGS.map(({ key, label, color, dot }) => (
              <div key={key} className="text-center">
                <div className="text-2xl font-bold">{totals[key as keyof typeof totals]}</div>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className={`text-xs ${color}`}>{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No projects found.</div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div
              key={p.projectId}
              onClick={() => navigate(`/projects/${p.projectId}`)}
              className="border rounded-lg p-5 hover:border-primary/40 hover:bg-muted/10 cursor-pointer transition-colors"
            >
              <div className="flex items-start gap-5">
                {/* Ring */}
                <CoverageRing passRate={p.passRate} coverage={p.coverage} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
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
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p.coverage}% executed ({p.executed}/{p.total})
                    </span>
                  </div>

                  {/* Coverage bar */}
                  <CoverageBar value={p.coverage} color="bg-primary" />

                  {/* Stats */}
                  <div className="grid grid-cols-6 gap-2 mt-4">
                    {STAT_CONFIGS.map(({ key, label, color, dot }) => (
                      <div key={key} className="flex flex-col items-center text-center">
                        <span className={`text-lg font-bold ${color}`}>
                          {p[key as keyof ProjectCoverage] as number}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                          <span className="text-[11px] text-muted-foreground">{label}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mini status breakdown bar */}
                  {p.total > 0 && (
                    <div className="flex h-1.5 rounded-full overflow-hidden gap-px mt-3">
                      {p.pass > 0 && (
                        <div
                          className="bg-green-400 transition-all duration-500"
                          style={{ width: `${(p.pass / p.total) * 100}%` }}
                        />
                      )}
                      {p.fail > 0 && (
                        <div
                          className="bg-red-400 transition-all duration-500"
                          style={{ width: `${(p.fail / p.total) * 100}%` }}
                        />
                      )}
                      {p.bugs > 0 && (
                        <div
                          className="bg-orange-400 transition-all duration-500"
                          style={{ width: `${(p.bugs / p.total) * 100}%` }}
                        />
                      )}
                      {p.skip > 0 && (
                        <div
                          className="bg-muted-foreground/50 transition-all duration-500"
                          style={{ width: `${(p.skip / p.total) * 100}%` }}
                        />
                      )}
                      {p.todo > 0 && (
                        <div
                          className="bg-muted transition-all duration-500"
                          style={{ width: `${(p.todo / p.total) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
