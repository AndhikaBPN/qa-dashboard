import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { X, ExternalLink } from 'lucide-react'

export interface BugFormBug {
  id: string
  title: string
  steps: string[]
  attachment: string[]
  expectedResult: string
  actualResult: string
  severity: string
  priority: string
  type: string
  status: string
  assigneeId: string | null
  testCaseId: string | null
  jiraLink?: string | null
}

interface User { id: string; name: string }

interface Props {
  projectId: string
  editBug?: BugFormBug | null
  defaultTestCaseId?: string | null
  users: User[]
  onClose: () => void
}

export default function BugFormModal({ projectId, editBug, defaultTestCaseId, users: _users, onClose }: Props) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(editBug?.title ?? '')
  const [jiraLink, setJiraLink] = useState(editBug?.jiraLink ?? '')

  const createMut = useMutation({
    mutationFn: (body: any) => api.post('/bugs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs'] })
      qc.invalidateQueries({ queryKey: ['tc-bugs'] })
      onClose()
    },
  })
  const updateMut = useMutation({
    mutationFn: (body: any) => api.put(`/bugs/${editBug!.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs'] })
      qc.invalidateQueries({ queryKey: ['tc-bugs'] })
      onClose()
    },
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    const link = jiraLink.trim()
    const payload = {
      projectId,
      title: title.trim() || link,
      jiraLink: link,
      expectedResult: '-',
      actualResult: '-',
      testCaseId: editBug?.testCaseId ?? defaultTestCaseId ?? null,
    }
    if (editBug) updateMut.mutate(payload)
    else createMut.mutate(payload)
  }

  const canSubmit = jiraLink.trim().length > 0
  const isPending = createMut.isPending || updateMut.isPending
  const isValidUrl = jiraLink.trim().startsWith('http://') || jiraLink.trim().startsWith('https://')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border rounded-lg shadow-xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">{editBug ? 'Edit Bug' : 'Report New Bug'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              placeholder="Brief description of the bug"
            />
          </div>

          {/* Jira Link */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">Jira Bug Link *</label>
            <input
              value={jiraLink}
              onChange={(e) => setJiraLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              placeholder="https://yourorg.atlassian.net/browse/PROJ-123"
            />
            {isValidUrl && (
              <a
                href={jiraLink.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1.5"
              >
                <ExternalLink className="h-3 w-3" />
                {jiraLink.trim()}
              </a>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {editBug ? 'Save Changes' : 'Report Bug'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── OLD FORM (commented out — kept for reference) ────────────────────────────
/*
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { X, Plus, Clipboard, Image, Link } from 'lucide-react'

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST']
const TYPES = ['FUNCTIONAL', 'UI', 'PERFORMANCE', 'SECURITY', 'API', 'INTEGRATION', 'OTHER']
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', CLOSED: 'Closed',
}

function isDataUrl(s: string) { return s.startsWith('data:image/') }
function isHttpUrl(s: string) { return s.startsWith('http://') || s.startsWith('https://') }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Old full form fields:
//   - title, expectedResult, actualResult, severity, priority, type, status, assigneeId, testCaseId
//   - steps: dynamic array (add/remove)
//   - attachments: drag-drop, paste, URL input, thumbnail grid, lightbox
//   - testCases query from /test-cases
//   - canSubmit = title && expectedResult && actualResult
//   - payload includes all fields + steps + attachment
*/
