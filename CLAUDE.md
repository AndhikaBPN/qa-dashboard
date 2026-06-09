# CLAUDE.md — QA Hub

## Project Overview

QA Hub adalah internal tool pengganti AIO Test (Jira) untuk manajemen testcase tim QA.
Free tier, self-hosted, full-stack JS/TS.

**Core features:**
- Test case management (CRUD, filter, bulk action)
- Test suite / cycle management (folder hierarchy)
- Test execution tracker (run, update status, capture evidence)
- Dashboard & reporting (pass rate, coverage, trend)
- Jira integration (link TC ke Jira issue)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS v3 |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Backend | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL |
| Auth | JWT (access + refresh token) |
| Export | xlsx + @react-pdf/renderer |
| Testing | Vitest (unit) + Playwright (e2e) |

**Monorepo structure:**
```
qa-hub/
├── apps/
│   ├── web/          # React frontend (Vite)
│   └── api/          # Fastify backend
├── packages/
│   └── shared/       # Shared types & zod schemas
├── prisma/
│   └── schema.prisma
├── .env.example
└── package.json      # root workspace (pnpm)
```

---

## Database Schema (Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  role      Role     @default(QA)
  createdAt DateTime @default(now())
  testCases TestCase[]
  executions Execution[]
}

model TestSuite {
  id        String      @id @default(cuid())
  name      String
  parentId  String?
  parent    TestSuite?  @relation("SuiteTree", fields: [parentId], references: [id])
  children  TestSuite[] @relation("SuiteTree")
  testCases TestCase[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

model TestCase {
  id           String       @id @default(cuid())
  tcId         String       @unique  // TC-001, TC-002 ...
  title        String
  precondition String?
  steps        Json         // Step[]
  expectedResult String
  priority     Priority
  type         TestType
  scenarioType ScenarioType
  suiteId      String?
  suite        TestSuite?   @relation(fields: [suiteId], references: [id])
  authorId     String
  author       User         @relation(fields: [authorId], references: [id])
  jiraIssueKey String?      // e.g. AUTH-142
  executions   Execution[]
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}

model TestRun {
  id         String      @id @default(cuid())
  name       String      // e.g. "Sprint 24 Regression"
  suiteId    String?
  executions Execution[]
  createdAt  DateTime    @default(now())
  completedAt DateTime?
}

model Execution {
  id         String          @id @default(cuid())
  testCaseId String
  testCase   TestCase        @relation(fields: [testCaseId], references: [id])
  testRunId  String
  testRun    TestRun         @relation(fields: [testRunId], references: [id])
  executorId String
  executor   User            @relation(fields: [executorId], references: [id])
  status     ExecutionStatus
  actualResult String?
  evidence   String[]        // array of image URLs
  executedAt DateTime        @default(now())
}

enum Role          { ADMIN QA VIEWER }
enum Priority      { CRITICAL HIGH MEDIUM LOW LOWEST }
enum TestType      { UNIT INTEGRATION FUNCTIONAL PERFORMANCE API SECURITY }
enum ScenarioType  { POSITIVE NEGATIVE EDGE_CASE }
enum ExecutionStatus { PASS FAIL SKIP BLOCKED NOT_RUN }
```

---

## API Endpoints

Base URL: `/api/v1`

```
POST   /auth/login                    body: { email, password }
POST   /auth/refresh                  body: { refreshToken }
POST   /auth/logout

GET    /test-cases                    query: suiteId, priority, type, status, search, page, limit
POST   /test-cases                    body: TestCaseCreate
GET    /test-cases/:id
PUT    /test-cases/:id
DELETE /test-cases/:id
POST   /test-cases/bulk               body: { ids[], action: 'delete'|'move'|'assign-suite' }
GET    /test-cases/export             query: format=csv|xlsx
POST   /test-cases/import             multipart: file

GET    /suites                        # returns full tree
POST   /suites                        body: { name, parentId? }
PUT    /suites/:id
DELETE /suites/:id

GET    /test-runs
POST   /test-runs                     body: { name, suiteId?, testCaseIds[] }
GET    /test-runs/:id/progress        # { total, pass, fail, blocked, notRun }
PUT    /test-runs/:id/complete

PUT    /executions/:id                body: { status, actualResult?, evidence? }
POST   /executions/bulk-update        body: { ids[], status }

GET    /reports/summary               query: from, to
GET    /reports/trend                 query: weeks=8
GET    /jira/issues/:key
POST   /jira/link                     body: { testCaseId, jiraIssueKey }
```

---

## Frontend Structure

```
apps/web/src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx       # sidebar + topbar wrapper
│   │   ├── Sidebar.tsx
│   │   └── Topbar.tsx
│   ├── testcase/
│   │   ├── TestCaseTable.tsx  # main table with virtualization
│   │   ├── TestCaseDetail.tsx # right side panel
│   │   ├── TestCaseForm.tsx   # create/edit modal
│   │   └── FilterToolbar.tsx
│   ├── suite/
│   │   ├── SuiteTree.tsx      # left panel folder tree
│   │   └── SuiteForm.tsx
│   ├── run/
│   │   ├── RunList.tsx
│   │   ├── RunDetail.tsx      # execution grid per run
│   │   └── ExecutionCard.tsx
│   └── ui/                    # shadcn/ui components
├── pages/
│   ├── TestCasesPage.tsx
│   ├── TestRunsPage.tsx
│   ├── ReportsPage.tsx
│   └── SettingsPage.tsx
├── stores/
│   ├── testCaseStore.ts
│   ├── suiteStore.ts
│   └── authStore.ts
├── hooks/
│   ├── useTestCases.ts        # react-query hooks
│   ├── useSuites.ts
│   └── useExecutions.ts
├── lib/
│   ├── api.ts                 # axios instance + interceptors
│   └── utils.ts
└── types/                     # re-export from packages/shared
```

---

## Key Component Behavior

### TestCaseTable
- Virtual scroll via `@tanstack/react-virtual` — handles 1000+ rows
- Sticky header
- Multi-select via checkbox + shift-click range select
- Inline status badge click → quick update status
- Row click → open TestCaseDetail side panel (no page nav)
- Columns: ID · Title+metadata · Priority · Type · Status · Updated

### SuiteTree
- Collapsible folder tree
- Drag-and-drop reorder via `@dnd-kit/core`
- Right-click context menu: rename, delete, add child
- Active suite highlights + filters TestCaseTable

### TestCaseForm (Create/Edit)
- Modal dialog
- Steps field: dynamic array (add/remove/reorder)
- Auto-generate tcId on create (server-side, sequential)
- Jira issue key field with validate-on-blur (call Jira API)

### FilterToolbar (Quick filters — chip style)
- All · Critical · Failed · Blocked · Not Run
- Advanced filter drawer: Priority, Type, ScenarioType, Suite, Author, Date range

---

## Environment Variables

```env
# apps/api/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/qa_hub
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
PORT=3001

# Jira integration (optional)
JIRA_BASE_URL=https://yourorg.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your_api_token

# apps/web/.env
VITE_API_URL=http://localhost:3001/api/v1
```

---

## Dev Commands

```bash
# Install (root)
pnpm install

# DB setup
pnpm prisma migrate dev --name init
pnpm prisma db seed

# Run dev
pnpm dev              # runs both api + web concurrently

# Run individually
pnpm --filter api dev
pnpm --filter web dev

# Build
pnpm build

# Test
pnpm test             # vitest unit
pnpm test:e2e         # playwright
```

---

## Coding Conventions

- TypeScript strict mode — no `any`
- Zod schemas in `packages/shared` — reused FE + BE validation
- API responses: `{ data, meta? }` (success) / `{ error, message }` (error)
- HTTP status: 200 GET/PUT, 201 POST, 204 DELETE, 400 validation, 401 auth, 404 not found
- Prisma queries in service layer only — never in route handlers
- React Query for all server state — no manual fetch in components
- Zustand only for UI state (selected suite, open panels, filter state)
- shadcn/ui + Tailwind only — no inline styles, no custom CSS files

---

## Build Order
1. `prisma/schema.prisma` → migrate → seed
2. `packages/shared` → types + zod schemas
3. `apps/api` → auth routes → test-case CRUD → suite CRUD → runs + executions → reports
4. `apps/web` → AppShell → SuiteTree → TestCaseTable → TestCaseDetail → TestCaseForm → RunPages → Reports
5. Jira integration last
6. Playwright e2e tests