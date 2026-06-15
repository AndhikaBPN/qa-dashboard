import { z } from 'zod';
export const ProjectStatusEnum = z.enum(['ACTIVE', 'ARCHIVED']);
export const ProjectCreateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    status: ProjectStatusEnum.optional(),
});
export const ProjectUpdateSchema = ProjectCreateSchema.partial();
export const RoleEnum = z.enum(['ADMIN', 'QA', 'VIEWER']);
export const UserCreateSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: z.string().min(6),
    role: RoleEnum.default('QA'),
});
export const UserUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    role: RoleEnum.optional(),
    password: z.string().min(6).optional(),
});
export const PriorityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST']);
export const TestTypeEnum = z.enum(['UNIT', 'INTEGRATION', 'FUNCTIONAL', 'PERFORMANCE', 'API', 'SECURITY']);
export const ScenarioTypeEnum = z.enum(['POSITIVE', 'NEGATIVE', 'EDGE_CASE']);
export const ExecutionStatusEnum = z.enum(['PASS', 'FAIL', 'SKIP', 'BLOCKED', 'NOT_RUN']);
export const StepSchema = z.object({
    order: z.number().int().positive(),
    action: z.string().min(1),
    testData: z.string().optional().default(''),
    expectedStepResult: z.string().optional().default(''),
});
export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});
export const RefreshSchema = z.object({
    refreshToken: z.string().min(1),
});
export const TestCaseCreateSchema = z.object({
    title: z.string().min(1).max(255),
    precondition: z.string().optional(),
    steps: z.array(StepSchema).min(1),
    expectedResult: z.string().min(1),
    priority: PriorityEnum,
    type: TestTypeEnum,
    scenarioType: ScenarioTypeEnum,
    suiteId: z.string().cuid().optional(),
    projectId: z.string().cuid().optional(),
    jiraIssueKey: z.string().optional(),
});
export const TestCaseUpdateSchema = TestCaseCreateSchema.partial();
export const TestCaseQuerySchema = z.object({
    suiteId: z.string().cuid().optional(),
    projectId: z.string().cuid().optional(),
    priority: PriorityEnum.optional(),
    type: TestTypeEnum.optional(),
    scenarioType: ScenarioTypeEnum.optional(),
    status: ExecutionStatusEnum.optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(500).default(20),
});
export const BulkActionSchema = z.object({
    ids: z.array(z.string().cuid()).min(1),
    action: z.enum(['delete', 'move', 'assign-suite']),
    suiteId: z.string().cuid().optional(),
});
export const ExportQuerySchema = z.object({
    format: z.enum(['csv', 'xlsx']).default('xlsx'),
    suiteId: z.string().cuid().optional(),
});
export const SuiteTypeEnum = z.enum(['CASE_FOLDER', 'RUN_FOLDER']);
export const SuiteCreateSchema = z.object({
    name: z.string().min(1).max(100),
    parentId: z.string().cuid().optional(),
    projectId: z.string().cuid().optional(),
    type: SuiteTypeEnum.optional().default('CASE_FOLDER'),
});
export const SuiteUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    parentId: z.string().cuid().nullable().optional(),
    orderIndex: z.number().int().min(0).optional(),
});
export const TestRunCreateSchema = z.object({
    name: z.string().min(1).max(255),
    suiteId: z.string().cuid().optional(),
    projectId: z.string().cuid().optional(),
    testCaseIds: z.array(z.string().cuid()).min(1),
});
export const ExecutionUpdateSchema = z.object({
    status: ExecutionStatusEnum,
    actualResult: z.string().optional(),
    evidence: z.array(z.string().url()).optional(),
});
export const BulkExecutionUpdateSchema = z.object({
    ids: z.array(z.string().cuid()).min(1),
    status: ExecutionStatusEnum,
});
export const ReportQuerySchema = z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});
export const TrendQuerySchema = z.object({
    weeks: z.coerce.number().int().min(1).max(52).default(8),
});
export const JiraLinkSchema = z.object({
    testCaseId: z.string().cuid(),
    jiraIssueKey: z.string().min(1),
});
export const BugSeverityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export const BugStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
export const BugTypeEnum = z.enum(['FUNCTIONAL', 'UI', 'PERFORMANCE', 'SECURITY', 'API', 'INTEGRATION', 'OTHER']);
export const BugCreateSchema = z.object({
    title: z.string().min(1).max(255),
    steps: z.array(z.string()).default([]),
    attachment: z.array(z.string()).default([]),
    expectedResult: z.string().min(1),
    actualResult: z.string().min(1),
    severity: BugSeverityEnum,
    priority: PriorityEnum,
    type: BugTypeEnum,
    projectId: z.string().cuid(),
    assigneeId: z.string().cuid().optional().nullable(),
    testCaseId: z.string().cuid().optional().nullable(),
});
export const BugUpdateSchema = BugCreateSchema.omit({ projectId: true }).partial().extend({
    status: BugStatusEnum.optional(),
});
export const BugQuerySchema = z.object({
    projectId: z.string().cuid().optional(),
    status: BugStatusEnum.optional(),
    severity: BugSeverityEnum.optional(),
    priority: PriorityEnum.optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(50),
});
