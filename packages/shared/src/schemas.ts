import { z } from 'zod'

export const RoleEnum = z.enum(['ADMIN', 'QA', 'VIEWER'])
export const PriorityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'])
export const TestTypeEnum = z.enum(['UNIT', 'INTEGRATION', 'FUNCTIONAL', 'PERFORMANCE', 'API', 'SECURITY'])
export const ScenarioTypeEnum = z.enum(['POSITIVE', 'NEGATIVE', 'EDGE_CASE'])
export const ExecutionStatusEnum = z.enum(['PASS', 'FAIL', 'SKIP', 'BLOCKED', 'NOT_RUN'])

export const StepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1),
  testData: z.string().optional().default(''),
  expectedStepResult: z.string().optional().default(''),
})

export const TestCaseCreateSchema = z.object({
  title: z.string().min(1).max(255),
  precondition: z.string().optional(),
  steps: z.array(StepSchema).min(1),
  expectedResult: z.string().min(1),
  priority: PriorityEnum,
  type: TestTypeEnum,
  scenarioType: ScenarioTypeEnum,
  suiteId: z.string().cuid().optional(),
  jiraIssueKey: z.string().optional(),
})

export const TestCaseUpdateSchema = TestCaseCreateSchema.partial()

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
})
