import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export default function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-summary'],
    queryFn: () => api.get('/reports/summary').then((r) => r.data),
  })

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>

  const summary = data?.data

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Reports</h1>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Test Cases', value: summary.totalTestCases },
            { label: 'Total Runs', value: summary.totalRuns },
            { label: 'Pass Rate', value: `${summary.executions.passRate}%` },
            { label: 'Total Executions', value: summary.executions.total },
          ].map(({ label, value }) => (
            <div key={label} className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
