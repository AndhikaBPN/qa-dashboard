import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Circle, Folder,
} from 'lucide-react'

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PASS:    <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAIL:    <XCircle className="h-4 w-4 text-red-500" />,
  BLOCKED: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  SKIP:    <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  NOT_RUN: <Circle className="h-4 w-4 text-muted-foreground" />,
}

const STATUS_COLORS: Record<string, string> = {
  PASS:    'bg-green-900/60 text-green-300',
  FAIL:    'bg-red-900/60 text-red-300',
  BLOCKED: 'bg-orange-900/60 text-orange-300',
  SKIP:    'bg-muted text-muted-foreground',
  NOT_RUN: 'bg-muted text-muted-foreground',
}

interface Progress {
  total: number; pass: number; fail: number
  blocked: number; skip: number; notRun: number
  executed: number; passRate: number
}

interface Execution {
  id: string; status: string; actualResult: string | null
  testCase: { id: string; tcId: string; title: string; priority: string; type: string; expectedResult: string }
}

interface SharedRun {
  id: string; name: string; completedAt: string | null; createdAt: string
  suite: { id: string; name: string } | null
  project: { id: string; name: string } | null
  progress: Progress
  executions: Execution[]
}

export default function SharedSuitePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery<SharedRun>({
    queryKey: ['shared', token],
    queryFn: () => api.get(`/shared/${token}`).then((r) => r.data.data),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <p className="text-lg font-semibold">Link not found or has been revoked.</p>
        <p className="text-sm text-muted-foreground">Contact the QA team for access.</p>
      </div>
    )
  }

  const { progress, executions } = data

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b bg-muted/20 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">QA Hub</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">Shared Report</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(data.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-xl font-bold">{data.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {data.suite && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Folder className="h-3.5 w-3.5" /> {data.suite.name}
              </span>
            )}
            {data.project && (
              <span className="text-xs text-muted-foreground">Project: {data.project.name}</span>
            )}
            {data.completedAt && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/60 text-green-300">
                Completed
              </span>
            )}
          </div>
        </div>

        {/* Progress summary */}
        <div className="border rounded-lg p-4 bg-muted/10 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-400">
              <CheckCircle2 className="h-4 w-4" /> {progress.pass} Pass
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <XCircle className="h-4 w-4" /> {progress.fail} Fail
            </span>
            <span className="flex items-center gap-1.5 text-orange-400">
              <AlertTriangle className="h-4 w-4" /> {progress.blocked} Blocked
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MinusCircle className="h-4 w-4" /> {progress.skip} Skip
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Circle className="h-4 w-4" /> {progress.notRun} Not Run
            </span>
            <span className="ml-auto font-semibold text-base">{progress.passRate}% pass rate</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${progress.passRate}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.executed} of {progress.total} executed
          </p>
        </div>

        {/* Execution table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-20">Priority</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Expected Result</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Actual Result</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => (
                <tr key={exec.id} className="border-t hover:bg-muted/10">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{exec.testCase.tcId}</td>
                  <td className="px-4 py-3">
                    <span className="line-clamp-2 leading-snug">{exec.testCase.title}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{exec.testCase.priority}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {exec.testCase.expectedResult || <span className="italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {exec.actualResult || <span className="italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[exec.status]}`}>
                      {STATUS_ICONS[exec.status]} {exec.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-center text-muted-foreground/50 pt-4">
          Generated by QA Hub · Read-only view
        </p>
      </div>
    </div>
  )
}
