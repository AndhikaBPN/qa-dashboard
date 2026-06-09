import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export default function TestCasesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['test-cases'],
    queryFn: () => api.get('/test-cases').then((r) => r.data),
  })

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Test Cases</h1>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {['ID', 'Title', 'Priority', 'Type', 'Scenario'].map((h) => (
                <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.data?.map((tc: any) => (
              <tr key={tc.id} className="border-t hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-2 font-mono text-xs">{tc.tcId}</td>
                <td className="px-4 py-2">{tc.title}</td>
                <td className="px-4 py-2">{tc.priority}</td>
                <td className="px-4 py-2">{tc.type}</td>
                <td className="px-4 py-2">{tc.scenarioType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
