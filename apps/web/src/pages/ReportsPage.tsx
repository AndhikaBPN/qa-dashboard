import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '@/lib/api'
import { CheckCircle2, Bug, FlaskConical, TrendingUp, AlertCircle, Circle, Loader2 } from 'lucide-react'

type Period = 'week' | 'month' | 'year'

type BugsBySuiteRow = {
  suiteId: string; suiteName: string
  OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number
}
type BugsBySuiteData = {
  totals: { OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number }
  bySuite: BugsBySuiteRow[]
}

function buildParams(period: Period, projectId: string, from: string, to: string) {
  const p: Record<string, string> = {}
  if (period) p.period = period
  if (projectId) p.projectId = projectId
  if (from) { p.from = from; delete p.period }
  if (to) { p.to = to; delete p.period }
  return new URLSearchParams(p).toString()
}

function StatCard({
  label, value, sub, icon, color,
}: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-card border rounded-lg p-4 flex gap-3 items-start">
      <div className={`mt-0.5 p-2 rounded-md ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
]

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [projectFilter, setProjectFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customActive, setCustomActive] = useState(false)

  const qs = buildParams(customActive ? ('custom' as Period) : period, projectFilter, from, to)

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['report-summary', qs],
    queryFn: () => api.get(`/reports/summary?${qs}`).then((r) => r.data.data),
  })

  const { data: projectStats, isLoading: projLoading } = useQuery({
    queryKey: ['report-project-stats', qs],
    queryFn: () => api.get(`/reports/project-stats?${qs}`).then((r) => r.data.data),
  })

  const trendQs = (() => {
    const p: Record<string, string> = { period: customActive ? 'month' : period }
    if (projectFilter) p.projectId = projectFilter
    if (from) p.from = from
    if (to) p.to = to
    return new URLSearchParams(p).toString()
  })()

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['report-trend', trendQs],
    queryFn: () => api.get(`/reports/trend?${trendQs}`).then((r) => r.data.data),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects').then((r) => r.data.data as { id: string; name: string }[]),
  })

  const { data: bugsBySuite, isLoading: bugsLoading } = useQuery({
    queryKey: ['report-bugs-by-suite', projectFilter],
    queryFn: () => {
      const p = new URLSearchParams()
      if (projectFilter) p.set('projectId', projectFilter)
      return api.get(`/reports/bugs-by-suite?${p}`).then((r) => r.data.data as BugsBySuiteData)
    },
  })

  const s = summaryData
  const periodLabel = customActive ? 'custom range' : period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'this year'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reports</h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center p-3 bg-card border rounded-lg">
        {/* Period tabs */}
        <div className="flex gap-1 bg-muted rounded-md p-1">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setPeriod(t.key); setCustomActive(false); setFrom(''); setTo('') }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                !customActive && period === t.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setCustomActive(true)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              customActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Custom
          </button>
        </div>

        {customActive && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-xs px-2 bg-background border rounded-md"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-xs px-2 bg-background border rounded-md"
            />
          </>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Project:</span>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-8 text-xs px-2 bg-background border rounded-md"
          >
            <option value="">All Projects</option>
            {projectsData?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border rounded-lg p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : s ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="TC Created"
            value={s.tcCreatedInPeriod}
            sub={`${s.totalTestCases} total`}
            icon={<FlaskConical className="h-4 w-4" />}
            color="bg-blue-500/15 text-blue-400"
          />
          <StatCard
            label="TC Executed"
            value={s.executions.executed}
            sub={`${s.executions.passRate}% pass rate`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            color="bg-green-500/15 text-green-400"
          />
          <StatCard
            label="Bugs Reported"
            value={s.bugsInPeriod}
            sub={`${s.totalBugs} total`}
            icon={<Bug className="h-4 w-4" />}
            color="bg-red-500/15 text-red-400"
          />
          <StatCard
            label="Test Runs"
            value={s.totalRuns}
            sub={periodLabel}
            icon={<TrendingUp className="h-4 w-4" />}
            color="bg-purple-500/15 text-purple-400"
          />
        </div>
      ) : null}

      {/* Execution breakdown */}
      {s && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Pass', count: s.executions.pass, cls: 'text-green-400' },
            { label: 'Fail', count: s.executions.fail, cls: 'text-red-400' },
            { label: 'Blocked', count: s.executions.blocked, cls: 'text-orange-400' },
            { label: 'Skipped', count: s.executions.skip, cls: 'text-yellow-400' },
            { label: 'Not Run', count: s.executions.notRun, cls: 'text-muted-foreground' },
          ].map(({ label, count, cls }) => (
            <div key={label} className="bg-card border rounded-lg p-3 text-center">
              <p className={`text-xl font-bold ${cls}`}>{count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trend chart */}
      <div className="bg-card border rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-4">Execution Trend</h2>
        {trendLoading ? (
          <div className="h-56 animate-pulse bg-muted rounded" />
        ) : trendData?.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="pass" name="Pass" fill="#4ade80" stackId="a" />
              <Bar dataKey="fail" name="Fail" fill="#f87171" stackId="a" />
              <Bar dataKey="blocked" name="Blocked" fill="#fb923c" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
            No execution data for this period
          </div>
        )}
      </div>

      {/* ── Bugs Section ───────────────────────────────────────────── */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Bug className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold">Bugs by Test Suite</h2>
          {projectFilter && (
            <span className="text-xs text-muted-foreground">
              — {projectsData?.find((p) => p.id === projectFilter)?.name}
            </span>
          )}
        </div>
        {bugsLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bugsBySuite ? (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Open',        key: 'OPEN',        cls: 'text-red-400',   bg: 'bg-red-500/10'   },
                { label: 'In Progress', key: 'IN_PROGRESS', cls: 'text-amber-400', bg: 'bg-amber-500/10' },
                { label: 'Resolved',    key: 'RESOLVED',    cls: 'text-blue-400',  bg: 'bg-blue-500/10'  },
                { label: 'Closed',      key: 'CLOSED',      cls: 'text-green-400', bg: 'bg-green-500/10' },
              ].map(({ label, key, cls, bg }) => (
                <div key={key} className={`rounded-lg p-3 ${bg} border border-border/40 text-center`}>
                  <p className={`text-2xl font-bold ${cls}`}>
                    {bugsBySuite.totals[key as keyof typeof bugsBySuite.totals]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {bugsBySuite.bySuite.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Test Suite</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                      <th className="text-right px-3 py-2 font-medium text-red-400">Open</th>
                      <th className="text-right px-3 py-2 font-medium text-amber-400">In Progress</th>
                      <th className="text-right px-3 py-2 font-medium text-blue-400">Resolved</th>
                      <th className="text-right px-3 py-2 font-medium text-green-400">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bugsBySuite.bySuite.map((row) => (
                      <tr key={row.suiteId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 flex items-center gap-1.5">
                          <Circle className="h-2 w-2 shrink-0 text-muted-foreground" />
                          {row.suiteName}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.OPEN > 0 ? <span className="text-red-400 font-medium">{row.OPEN}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.IN_PROGRESS > 0 ? <span className="text-amber-400 font-medium">{row.IN_PROGRESS}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.RESOLVED > 0 ? <span className="text-blue-400 font-medium">{row.RESOLVED}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.CLOSED > 0 ? <span className="text-green-400 font-medium">{row.CLOSED}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No bugs found{projectFilter ? ' for this project' : ''}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Per-project breakdown */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <h2 className="text-sm font-semibold">Per-Project Breakdown</h2>
          <span className="text-xs text-muted-foreground">({periodLabel})</span>
        </div>
        {projLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Project</th>
                <th className="text-right px-3 py-2 font-medium">TC Total</th>
                <th className="text-right px-3 py-2 font-medium">TC (Period)</th>
                <th className="text-right px-3 py-2 font-medium">Executed</th>
                <th className="text-right px-3 py-2 font-medium">Pass Rate</th>
                <th className="text-right px-3 py-2 font-medium">Bugs (Period)</th>
                <th className="text-right px-4 py-2 font-medium">Open Bugs</th>
              </tr>
            </thead>
            <tbody>
              {projectStats?.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                    No projects found
                  </td>
                </tr>
              )}
              {projectStats?.map((p: {
                projectId: string; projectName: string; projectStatus: string;
                tcCount: number; tcInPeriod: number; executed: number; passRate: number;
                bugsInPeriod: number; openBugs: number;
              }) => (
                <tr key={p.projectId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{p.projectName}</span>
                    {p.projectStatus === 'ARCHIVED' && (
                      <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.tcCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="text-blue-400">+{p.tcInPeriod}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.executed}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-medium ${p.passRate >= 80 ? 'text-green-400' : p.passRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {p.passRate}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {p.bugsInPeriod > 0 ? (
                      <span className="text-red-400">{p.bugsInPeriod}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.openBugs > 0 ? (
                      <span className="flex items-center justify-end gap-1 text-orange-400">
                        <AlertCircle className="h-3 w-3" />
                        {p.openBugs}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
