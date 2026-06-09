import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ArrowLeft } from 'lucide-react'
import TestCasesTab from '@/components/project/TestCasesTab'
import TestSuitesTab from '@/components/project/TestSuitesTab'

type Tab = 'test-cases' | 'test-suites'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('test-cases')

  const { data, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then((r) => r.data.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>
  if (!data) return <div className="text-sm text-destructive">Project not found</div>

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </button>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-semibold">{data.name}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              data.status === 'ACTIVE' ? 'bg-green-900/60 text-green-300' : 'bg-muted text-muted-foreground'
            }`}
          >
            {data.status}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['test-cases', 'test-suites'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'test-cases' ? 'Test Cases' : 'Test Suites'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'test-cases' ? (
          <TestCasesTab projectId={id!} />
        ) : (
          <TestSuitesTab projectId={id!} />
        )}
      </div>
    </div>
  )
}
