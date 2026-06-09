import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, created, noContent, badRequest, notFound, pageMeta } from '../lib/response.js'
import {
  TestCaseCreateSchema, TestCaseUpdateSchema, TestCaseQuerySchema,
  BulkActionSchema, ExportQuerySchema,
} from '../types/schemas.js'

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

  fastify.post('/import', auth, async (request, reply) => {
    const data = await request.file()
    if (!data) return badRequest(reply, 'No file uploaded')

    const buffer = await data.toBuffer()
    const text = buffer.toString('utf-8')
    const lines = text.split('\n').filter(Boolean)
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''))

    const imported: string[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      try {
        const vals = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })

        const parsed = TestCaseCreateSchema.safeParse({
          title: row['Title'],
          precondition: row['Precondition'] || undefined,
          steps: JSON.parse(row['Steps'] || '[]'),
          expectedResult: row['Expected Result'],
          priority: row['Priority'],
          type: row['Type'],
          scenarioType: row['Scenario Type'],
          jiraIssueKey: row['Jira Issue'] || undefined,
        })

        if (!parsed.success) { errors.push(`Row ${i}: ${parsed.error.message}`); continue }

        const tcId = await generateTcId()
        const tc = await prisma.testCase.create({
          data: { ...parsed.data, tcId, steps: parsed.data.steps as any, authorId: request.user.sub },
        })
        imported.push(tc.tcId)
      } catch (e) {
        errors.push(`Row ${i}: ${String(e)}`)
      }
    }

    return ok(reply, { imported: imported.length, errors })
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
