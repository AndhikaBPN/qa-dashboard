import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '@/lib/api'
import { CheckCircle2, Bug, FlaskConical, TrendingUp, AlertCircle, Circle, Loader2, Users } from 'lucide-react'

type Period = 'week' | 'month' | 'year'

type BugsBySuiteRow = {
  suiteId: string; suiteName: string
  OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number
}
type BugsBySuiteData = {
  totals: { OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number }
  bySuite: BugsBySuiteRow[]
}

type ActivityWeek = { created: number; updated: number; executed: number; defects: number }
type ActivityUser = {
  userId: string; userName: string
  weeks: ActivityWeek[]
  totals: ActivityWeek
}
type UserActivityData = {
  weeks: { label: string; from: string; to: string }[]
  users: ActivityUser[]
  weekTotals: ActivityWeek[]
  overallTotals: ActivityWeek
}

type FilterMode = 'preset' | 'single' | 'range'

function buildParams(
  mode: FilterMode,
  period: Period,
  projectId: string,
  single: string,
  from: string,
  to: string,
  extra?: Record<string, string>,
) {
  const p: Record<string, string> = { ...extra }
  if (projectId) p.projectId = projectId
  if (mode === 'preset') {
    p.period = period
  } else if (mode === 'single' && single) {
    p.from = single; p.to = single
  } else if (mode === 'range') {
    if (from) p.from = from
    if (to) p.to = to
  }
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
  const [filterMode, setFilterMode] = useState<FilterMode>('preset')
  const [period, setPeriod] = useState<Period>('week')
  const [singleDate, setSingleDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [projectFilter, setProjectFilter] = useState('')

  const qs = buildParams(filterMode, period, projectFilter, singleDate, from, to)

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['report-summary', qs],
    queryFn: () => api.get(`/reports/summary?${qs}`).then((r) => r.data.data),
  })

  const { data: projectStats, isLoading: projLoading } = useQuery({
    queryKey: ['report-project-stats', qs],
    queryFn: () => api.get(`/reports/project-stats?${qs}`).then((r) => r.data.data),
  })

  // preset mode sends period param; single/range sends only from/to → API falls to weekly-bucket else branch
  const trendQs = buildParams(filterMode, period, projectFilter, singleDate, from, to)

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['report-trend', trendQs],
    queryFn: () => api.get(`/reports/trend?${trendQs}`).then((r) => r.data.data),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects').then((r) => r.data.data as { id: string; name: string }[]),
  })

  const { data: bugsBySuite, isLoading: bugsLoading } = useQuery({
    queryKey: ['report-bugs-by-suite', qs],
    queryFn: () => api.get(`/reports/bugs-by-suite?${qs}`).then((r) => r.data.data as BugsBySuiteData),
  })

  const [activityWeeks, setActivityWeeks] = useState(4)
  const [showNonEmpty, setShowNonEmpty] = useState(false)

  const activityQs = buildParams(filterMode, period, projectFilter, singleDate, from, to, { weeks: String(activityWeeks) })

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['report-user-activity', activityQs],
    queryFn: () => api.get(`/reports/user-activity?${activityQs}`).then((r) => r.data.data as UserActivityData),
  })

  const s = summaryData
  const periodLabel = filterMode === 'single' && singleDate
    ? singleDate
    : filterMode === 'range'
    ? `${from || '…'} – ${to || '…'}`
    : period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'this year'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reports</h1>
      </div>

      {/* ── Unified filter bar ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center p-3 bg-card border rounded-lg">
        {/* Mode tabs */}
        <div className="flex gap-1 bg-muted rounded-md p-1">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setFilterMode('preset'); setPeriod(t.key) }}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                filterMode === 'preset' && period === t.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setFilterMode('single')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              filterMode === 'single'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Single Date
          </button>
          <button
            onClick={() => setFilterMode('range')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              filterMode === 'range'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Date Range
          </button>
        </div>

        {filterMode === 'single' && (
          <input
            type="date"
            value={singleDate}
            onChange={(e) => setSingleDate(e.target.value)}
            className="h-8 text-xs px-2 bg-background border rounded-md"
          />
        )}

        {filterMode === 'range' && (
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

      {/* ── User Activity ───────────────────────────────────────────── */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm font-semibold">User Activity</h2>
          <div className="ml-auto flex items-center gap-4 flex-wrap">
            {/* Week count selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Show</span>
              {[4, 8, 12].map((w) => (
                <button
                  key={w}
                  onClick={() => setActivityWeeks(w)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    activityWeeks === w
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {w}w
                </button>
              ))}
            </div>
            {/* Non-empty toggle */}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showNonEmpty}
                onChange={(e) => setShowNonEmpty(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Show only non-empty items
            </label>
          </div>
        </div>

        {activityLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activityData ? (() => {
          const visibleUsers = showNonEmpty
            ? activityData.users.filter((u) =>
                u.totals.created + u.totals.updated + u.totals.executed + u.totals.defects > 0
              )
            : activityData.users

          const SUBCOLS = [
            { key: 'created' as const,  label: 'Case\ncreated'  },
            { key: 'updated' as const,  label: 'Case\nupdated'  },
            { key: 'executed' as const, label: 'Run\nexecuted'  },
            { key: 'defects' as const,  label: 'Defects\ndiscovered' },
          ]

          return (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse min-w-max w-full">
                <thead>
                  {/* Week header row */}
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium text-muted-foreground w-44 min-w-[176px] border-r">
                      User
                    </th>
                    {activityData.weeks.map((w) => (
                      <th
                        key={w.from}
                        colSpan={SUBCOLS.length}
                        className="px-2 py-2 text-center font-semibold border-r border-b-0 bg-muted/40"
                      >
                        {w.label}
                      </th>
                    ))}
                    <th
                      colSpan={SUBCOLS.length}
                      className="px-2 py-2 text-center font-semibold bg-muted/60"
                    >
                      Total
                    </th>
                  </tr>
                  {/* Sub-column header row */}
                  <tr className="border-b bg-muted/20">
                    <th className="sticky left-0 z-10 bg-muted/20 px-4 py-1.5 border-r" />
                    {activityData.weeks.map((w) =>
                      SUBCOLS.map((c) => (
                        <th
                          key={`${w.from}-${c.key}`}
                          className="px-2 py-1.5 text-center font-medium text-muted-foreground whitespace-pre-line leading-tight border-r last-of-type:border-r-0"
                          style={{ minWidth: 52 }}
                        >
                          {c.label}
                        </th>
                      ))
                    )}
                    {SUBCOLS.map((c) => (
                      <th
                        key={`total-${c.key}`}
                        className="px-2 py-1.5 text-center font-medium text-muted-foreground whitespace-pre-line leading-tight"
                        style={{ minWidth: 52 }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.userId} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-card hover:bg-muted/20 px-4 py-2 font-medium border-r truncate max-w-[176px]">
                        {user.userName}
                      </td>
                      {user.weeks.map((w, wi) =>
                        SUBCOLS.map((c) => (
                          <td
                            key={`${wi}-${c.key}`}
                            className="px-2 py-2 text-center tabular-nums border-r"
                          >
                            {w[c.key] > 0
                              ? <span className="text-cyan-400 font-medium">{w[c.key]}</span>
                              : <span className="text-muted-foreground/40">0</span>}
                          </td>
                        ))
                      )}
                      {SUBCOLS.map((c) => (
                        <td key={`total-${c.key}`} className="px-2 py-2 text-center tabular-nums font-semibold">
                          {user.totals[c.key] > 0
                            ? <span className="text-cyan-400">{user.totals[c.key]}</span>
                            : <span className="text-muted-foreground/40">0</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {visibleUsers.length === 0 && (
                    <tr>
                      <td colSpan={activityData.weeks.length * SUBCOLS.length + SUBCOLS.length + 1}
                        className="py-8 text-center text-muted-foreground">
                        No activity in this period
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/30 px-4 py-2 border-r">Total</td>
                    {activityData.weekTotals.map((wt, wi) =>
                      SUBCOLS.map((c) => (
                        <td key={`ft-${wi}-${c.key}`} className="px-2 py-2 text-center tabular-nums border-r">
                          {wt[c.key] > 0 ? wt[c.key] : <span className="text-muted-foreground/40">0</span>}
                        </td>
                      ))
                    )}
                    {SUBCOLS.map((c) => (
                      <td key={`ft-total-${c.key}`} className="px-2 py-2 text-center tabular-nums">
                        {activityData.overallTotals[c.key] > 0
                          ? activityData.overallTotals[c.key]
                          : <span className="text-muted-foreground/40">0</span>}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })() : null}
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
