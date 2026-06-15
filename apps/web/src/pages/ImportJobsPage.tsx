import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

interface ImportJob {
  id: string
  fileName: string
  projectId: string | null
  suiteId: string | null
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  testsCount: number
  errorCount: number
  errors: string[]
  createdAt: string
}

const STATUS_CONFIG = {
  COMPLETED: { label: 'COMPLETED', color: 'text-green-400', icon: CheckCircle2 },
  PROCESSING: { label: 'PROCESSING', color: 'text-yellow-400', icon: Loader2 },
  FAILED: { label: 'FAILED', color: 'text-red-400', icon: XCircle },
}

function JobRow({ job, index }: { job: ImportJob; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[job.status]
  const Icon = cfg.icon

  return (
    <>
      <tr className="border-t hover:bg-muted/20">
        <td className="px-4 py-3 text-xs text-muted-foreground">{index + 1}</td>
        <td className="px-4 py-3 font-mono text-xs max-w-[200px]">
          <span className="truncate block" title={job.id}>{job.id}</span>
        </td>
        <td className="px-4 py-3 text-sm font-medium max-w-xs">
          <span className="truncate block" title={job.fileName}>{job.fileName}</span>
        </td>
        <td className="px-4 py-3 text-sm text-center">{job.testsCount}</td>
        <td className="px-4 py-3">
          <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {cfg.label}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-center">
          {job.errorCount > 0 ? (
            <span className="text-red-400">{job.errorCount}</span>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(job.createdAt).toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </td>
        <td className="px-4 py-3">
          {job.errorCount > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground"
              title="View errors"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </td>
      </tr>
      {expanded && job.errorCount > 0 && (
        <tr className="border-t bg-red-950/10">
          <td colSpan={8} className="px-6 py-3">
            <p className="text-xs font-medium text-red-400 mb-2">Errors ({job.errorCount})</p>
            <ul className="space-y-0.5">
              {(Array.isArray(job.errors) ? job.errors : []).map((err, i) => (
                <li key={i} className="text-xs text-muted-foreground font-mono">{err}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ImportJobsPage() {
  const { data, isLoading } = useQuery<ImportJob[]>({
    queryKey: ['import-jobs'],
    queryFn: () => api.get('/test-cases/import/jobs').then((r) => r.data.data),
    refetchInterval: 10_000,
  })

  const jobs = data ?? []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Import Jobs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">History of all test case imports</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          No import jobs yet. Import test cases from a project page.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {['S.No', 'Batch ID', 'File Name', 'Tests Count', 'Status', 'Error Cases', 'Created Date', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <JobRow key={job.id} job={job} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
