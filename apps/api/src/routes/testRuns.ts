import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, created, noContent, badRequest, notFound, conflict } from '../lib/response.js'
import { TestRunCreateSchema } from '../types/schemas.js'

export const testRunRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/', auth, async (request, reply) => {
    const { projectId, suiteId, status, from, to } = request.query as {
      projectId?: string
      suiteId?: string
      status?: string
      from?: string
      to?: string
    }
    const runs = await prisma.testRun.findMany({
      where: {
        ...(projectId && { projectId }),
        ...(suiteId !== undefined ? (suiteId === 'null' ? { suiteId: null } : { suiteId }) : {}),
        ...(status === 'completed' ? { completedAt: { not: null } } : {}),
        ...(status === 'in-progress' ? { completedAt: null } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        suite: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    })
    return ok(reply, runs)
  })

  fastify.post('/', auth, async (request, reply) => {
    const body = TestRunCreateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const tcCount = await prisma.testCase.count({ where: { id: { in: body.data.testCaseIds } } })
    if (tcCount !== body.data.testCaseIds.length) {
      return badRequest(reply, 'One or more test case IDs are invalid')
    }

    const run = await prisma.testRun.create({
      data: {
        name: body.data.name,
        suiteId: body.data.suiteId,
        projectId: body.data.projectId,
        createdById: request.user.sub,
        executions: {
          create: body.data.testCaseIds.map((testCaseId) => ({
            testCaseId,
            executorId: request.user.sub,
            status: 'NOT_RUN' as const,
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    })
    return created(reply, run)
  })

  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const run = await prisma.testRun.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        suite: { select: { id: true, name: true } },
        executions: {
          include: {
            testCase: {
              select: {
                id: true, tcId: true, title: true, priority: true, type: true,
                scenarioType: true, expectedResult: true, jiraIssueKey: true, precondition: true,
              },
            },
            executor: { select: { id: true, name: true } },
          },
          orderBy: { testCase: { tcId: 'asc' } },
        },
      },
    })
    if (!run) return notFound(reply)
    return ok(reply, run)
  })

  fastify.get('/:id/progress', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const run = await prisma.testRun.findUnique({ where: { id } })
    if (!run) return notFound(reply)

    const counts = await prisma.execution.groupBy({
      by: ['status'],
      where: { testRunId: id },
      _count: { status: true },
    })

    const statusMap: Record<string, number> = {}
    counts.forEach((c) => { statusMap[c.status] = c._count.status })

    const total = Object.values(statusMap).reduce((a, b) => a + b, 0)
    const pass = statusMap['PASS'] ?? 0
    const fail = statusMap['FAIL'] ?? 0
    const blocked = statusMap['BLOCKED'] ?? 0
    const skip = statusMap['SKIP'] ?? 0
    const notRun = statusMap['NOT_RUN'] ?? 0
    const executed = total - notRun
    const passRate = executed > 0 ? Math.round((pass / executed) * 100) : 0

    return ok(reply, { total, pass, fail, blocked, skip, notRun, executed, passRate })
  })

  fastify.put('/:id/complete', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const run = await prisma.testRun.findUnique({ where: { id } })
    if (!run) return notFound(reply)
    if (run.completedAt) return conflict(reply, 'Test run already completed')

    const updated = await prisma.testRun.update({
      where: { id },
      data: { completedAt: new Date() },
    })
    return ok(reply, updated)
  })

  fastify.delete('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const run = await prisma.testRun.findUnique({ where: { id } })
    if (!run) return notFound(reply)

    await prisma.$transaction([
      prisma.execution.deleteMany({ where: { testRunId: id } }),
      prisma.testRun.delete({ where: { id } }),
    ])
    return noContent(reply)
  })
}
