import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, created, noContent, badRequest, notFound, pageMeta } from '../lib/response.js'
import {
  TestCaseCreateSchema, TestCaseUpdateSchema, TestCaseQuerySchema,
  BulkActionSchema, ExportQuerySchema,
} from '../types/schemas.js'
import * as XLSX from 'xlsx'

async function generateTcId(): Promise<string> {
  const last = await prisma.testCase.findFirst({ orderBy: { tcId: 'desc' } })
  if (!last) return 'TC-001'
  const num = parseInt(last.tcId.replace('TC-', ''), 10)
  return `TC-${String(num + 1).padStart(3, '0')}`
}

export const testCaseRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/', auth, async (request, reply) => {
    const query = TestCaseQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const { suiteId, projectId, priority, type, scenarioType, status, search, page, limit } = query.data
    const skip = (page - 1) * limit

    const where: Record<string, any> = {
      ...(suiteId && { suiteId }),
      ...(projectId && { projectId }),
      ...(priority && { priority }),
      ...(type && { type }),
      ...(scenarioType && { scenarioType }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { tcId: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(status && { executions: { some: { status } } }),
    }

    const [total, items] = await prisma.$transaction([
      prisma.testCase.count({ where }),
      prisma.testCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true } },
          suite: { select: { id: true, name: true } },
          executions: {
            orderBy: { executedAt: 'desc' },
            take: 1,
            select: { status: true, executedAt: true },
          },
        },
      }),
    ])

    return ok(reply, items, pageMeta(total, page, limit))
  })

  fastify.post('/', auth, async (request, reply) => {
    const body = TestCaseCreateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const tcId = await generateTcId()
    const testCase = await prisma.testCase.create({
      data: { ...body.data, tcId, steps: body.data.steps as any, authorId: request.user.sub },
      include: {
        author: { select: { id: true, name: true } },
        suite: { select: { id: true, name: true } },
      },
    })
    return created(reply, testCase)
  })

  fastify.get('/export', auth, async (request, reply) => {
    const query = ExportQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const testCases = await prisma.testCase.findMany({
      where: query.data.suiteId ? { suiteId: query.data.suiteId } : {},
      include: {
        author: { select: { name: true } },
        suite: { select: { name: true } },
      },
      orderBy: { tcId: 'asc' },
    })

    const rows = testCases.map((tc) => ({
      ID: tc.tcId,
      Title: tc.title,
      Suite: tc.suite?.name ?? '',
      Priority: tc.priority,
      Type: tc.type,
      'Scenario Type': tc.scenarioType,
      Precondition: tc.precondition ?? '',
      Steps: JSON.stringify(tc.steps),
      'Expected Result': tc.expectedResult,
      'Jira Issue': tc.jiraIssueKey ?? '',
      Author: tc.author.name,
    }))

    if (query.data.format === 'csv') {
      const headers = Object.keys(rows[0] ?? {}).join(',')
      const csv = [
        headers,
        ...rows.map((r) =>
          Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n')
      reply.header('Content-Type', 'text/csv')
      reply.header('Content-Disposition', 'attachment; filename="test-cases.csv"')
      return reply.send(csv)
    }

    return ok(reply, rows)
  })

  fastify.post('/bulk', auth, async (request, reply) => {
    const body = BulkActionSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const { ids, action, suiteId } = body.data

    switch (action) {
      case 'delete':
        await prisma.testCase.deleteMany({ where: { id: { in: ids } } })
        return noContent(reply)

      case 'move':
      case 'assign-suite': {
        if (!suiteId) return badRequest(reply, 'suiteId required for this action')
        const suite = await prisma.testSuite.findUnique({ where: { id: suiteId } })
        if (!suite) return notFound(reply, 'Suite not found')
        await prisma.testCase.updateMany({ where: { id: { in: ids } }, data: { suiteId } })
        return ok(reply, { updated: ids.length })
      }

      default:
        return badRequest(reply, 'Unknown bulk action')
    }
  })

  fastify.get('/import/jobs', auth, async (request, reply) => {
    const { projectId } = request.query as { projectId?: string }
    const jobs = await prisma.importJob.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return ok(reply, jobs)
  })

  fastify.post('/import', auth, async (request, reply) => {
    const parts = request.parts()
    let fileBuffer: Buffer | null = null
    let fileName = 'unknown.xlsx'
    let suiteId: string | undefined
    let projectId: string | undefined

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        fileName = part.filename
      } else {
        if (part.fieldname === 'suiteId' && part.value) suiteId = String(part.value)
        if (part.fieldname === 'projectId' && part.value) projectId = String(part.value)
      }
    }

    if (!fileBuffer) return badRequest(reply, 'No file uploaded')

    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

    const importedIds: string[] = []
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        let steps: unknown
        const stepsRaw = row['Steps'] ?? ''
        const testDataRaw = row['Test Data'] ?? row['TestData'] ?? ''
        try {
          steps = JSON.parse(stepsRaw)
        } catch {
          steps = stepsRaw
            ? [{ order: 1, action: stepsRaw, testData: testDataRaw, expectedStepResult: '' }]
            : [{ order: 1, action: '-', testData: '', expectedStepResult: '' }]
        }

        const parsed = TestCaseCreateSchema.safeParse({
          title: row['Title'],
          precondition: row['Precondition'] || undefined,
          steps,
          expectedResult: row['Expected Result'] || row['ExpectedResult'] || '-',
          priority: row['Priority'] || 'MEDIUM',
          type: row['Type'] || 'FUNCTIONAL',
          scenarioType: row['Scenario Type'] || row['ScenarioType'] || 'POSITIVE',
          jiraIssueKey: row['Jira Issue Key'] || row['Jira Issue'] || undefined,
          suiteId: suiteId || undefined,
          projectId: projectId || undefined,
        })

        if (!parsed.success) {
          errors.push(`Row ${i + 2}: ${parsed.error.errors[0]?.message ?? parsed.error.message}`)
          continue
        }

        const tcId = await generateTcId()
        const tc = await prisma.testCase.create({
          data: { ...parsed.data, tcId, steps: parsed.data.steps as any, authorId: request.user.sub },
        })
        importedIds.push(tc.tcId)
      } catch (e) {
        errors.push(`Row ${i + 2}: ${String(e)}`)
      }
    }

    const job = await prisma.importJob.create({
      data: {
        fileName,
        projectId: projectId ?? null,
        suiteId: suiteId ?? null,
        status: 'COMPLETED',
        testsCount: importedIds.length,
        errorCount: errors.length,
        errors: errors as any,
        createdById: request.user.sub,
      },
    })

    return ok(reply, { jobId: job.id, imported: importedIds.length, errorCount: errors.length, errors })
  })

  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true } },
        suite: { select: { id: true, name: true } },
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 5,
          include: { executor: { select: { id: true, name: true } } },
        },
      },
    })
    if (!testCase) return notFound(reply)
    return ok(reply, testCase)
  })

  fastify.put('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = TestCaseUpdateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const existing = await prisma.testCase.findUnique({ where: { id } })
    if (!existing) return notFound(reply)

    const testCase = await prisma.testCase.update({
      where: { id },
      data: { ...body.data, steps: body.data.steps as any },
      include: {
        author: { select: { id: true, name: true } },
        suite: { select: { id: true, name: true } },
      },
    })
    return ok(reply, testCase)
  })

  fastify.delete('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await prisma.testCase.findUnique({ where: { id } })
    if (!existing) return notFound(reply)

    await prisma.testCase.delete({ where: { id } })
    return noContent(reply)
  })
}
