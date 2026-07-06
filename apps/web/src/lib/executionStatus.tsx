import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Circle, MinusCircle, XCircle } from 'lucide-react'

export type ExecutionStatusKey = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIP' | 'NOT_RUN'

type ProgressCountKey = 'pass' | 'fail' | 'blocked' | 'skip' | 'notRun'

export interface ExecutionProgressSummary {
  total: number
  pass: number
  fail: number
  blocked: number
  skip: number
  notRun: number
}

interface ExecutionStatusMeta {
  label: string
  countKey: ProgressCountKey
  badgeClass: string
  summaryClass: string
  barClass: string
  icon: ReactNode
}

export const EXECUTION_STATUS_OPTIONS: ExecutionStatusKey[] = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED', 'SKIP']

export const EXECUTION_STATUS_ORDER: ExecutionStatusKey[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'NOT_RUN']

const EXECUTION_STATUS_META: Record<ExecutionStatusKey, ExecutionStatusMeta> = {
  PASS: {
    label: 'Pass',
    countKey: 'pass',
    badgeClass: 'bg-green-900/60 text-green-300',
    summaryClass: 'text-green-400',
    barClass: 'bg-green-500',
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  },
  FAIL: {
    label: 'Fail',
    countKey: 'fail',
    badgeClass: 'bg-red-900/60 text-red-300',
    summaryClass: 'text-red-400',
    barClass: 'bg-red-500',
    icon: <XCircle className="h-4 w-4 text-red-500" />,
  },
  BLOCKED: {
    label: 'Blocked',
    countKey: 'blocked',
    badgeClass: 'bg-yellow-900/60 text-yellow-300',
    summaryClass: 'text-yellow-400',
    barClass: 'bg-yellow-400',
    icon: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
  },
  SKIP: {
    label: 'Skip',
    countKey: 'skip',
    badgeClass: 'bg-orange-900/60 text-orange-300',
    summaryClass: 'text-orange-400',
    barClass: 'bg-orange-400',
    icon: <MinusCircle className="h-4 w-4 text-orange-400" />,
  },
  NOT_RUN: {
    label: 'Not Run',
    countKey: 'notRun',
    badgeClass: 'bg-slate-700/70 text-slate-300',
    summaryClass: 'text-slate-300',
    barClass: 'bg-slate-500',
    icon: <Circle className="h-4 w-4 text-slate-400" />,
  },
}

export function getExecutionStatusMeta(status: string): ExecutionStatusMeta {
  return EXECUTION_STATUS_META[status as ExecutionStatusKey] ?? EXECUTION_STATUS_META.NOT_RUN
}

export function getExecutionProgressItems(progress: ExecutionProgressSummary) {
  return EXECUTION_STATUS_ORDER.map((status) => {
    const meta = EXECUTION_STATUS_META[status]
    const count = progress[meta.countKey]

    return {
      status,
      count,
      width: progress.total > 0 ? (count / progress.total) * 100 : 0,
      ...meta,
    }
  })
}
