import { z } from 'zod'
import {
  RoleEnum, PriorityEnum, TestTypeEnum, ScenarioTypeEnum,
  ExecutionStatusEnum, StepSchema, TestCaseCreateSchema,
} from './schemas.js'

export type Role = z.infer<typeof RoleEnum>
export type Priority = z.infer<typeof PriorityEnum>
export type TestType = z.infer<typeof TestTypeEnum>
export type ScenarioType = z.infer<typeof ScenarioTypeEnum>
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>
export type Step = z.infer<typeof StepSchema>
export type TestCaseCreate = z.infer<typeof TestCaseCreateSchema>

export interface ApiResponse<T> {
  data: T
  meta?: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface ApiError {
  error: string
  message: string
}

export interface User {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
}

export interface TestSuite {
  id: string
  name: string
  parentId: string | null
  orderIndex: number
  createdAt: string
  updatedAt: string
  _count?: { testCases: number }
  children?: TestSuite[]
}

export interface TestCase {
  id: string
  tcId: string
  title: string
  precondition: string | null
  steps: Step[]
  expectedResult: string
  priority: Priority
  type: TestType
  scenarioType: ScenarioType
  suiteId: string | null
  suite?: Pick<TestSuite, 'id' | 'name'> | null
  authorId: string
  author: Pick<User, 'id' | 'name'>
  jiraIssueKey: string | null
  createdAt: string
  updatedAt: string
}

export interface TestRun {
  id: string
  name: string
  suiteId: string | null
  suite?: Pick<TestSuite, 'id' | 'name'> | null
  createdById: string
  createdBy: Pick<User, 'id' | 'name'>
  createdAt: string
  completedAt: string | null
  _count?: { executions: number }
}

export interface Execution {
  id: string
  testCaseId: string
  testCase?: Pick<TestCase, 'id' | 'tcId' | 'title' | 'priority' | 'type'>
  testRunId: string
  testRun?: Pick<TestRun, 'id' | 'name'>
  executorId: string
  executor: Pick<User, 'id' | 'name'>
  status: ExecutionStatus
  actualResult: string | null
  evidence: string[]
  executedAt: string
}
