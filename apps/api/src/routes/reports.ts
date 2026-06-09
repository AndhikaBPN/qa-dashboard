import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, badRequest } from '../lib/response.js'
import { ReportQuerySchema, TrendQuerySchema } from '../types/schemas.js'

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/summary', auth, async (request, reply) => {
    const query = ReportQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const dateFilter = {
      ...(query.data.from && { gte: query.data.from }),
      ...(query.data.to && { lte: query.data.to }),
    }
    const hasDate = Object.keys(dateFilter).length > 0

    const [totalTc, totalRuns, executions] = await prisma.$transaction([
      prisma.testCase.count(),
      prisma.testRun.count({ where: hasDate ? { createdAt: dateFilter } : {} }),
      prisma.execution.groupBy({
        by: ['status'],
        where: hasDate ? { executedAt: dateFilter } : {},
        _count: { status: true },
      }),
    ])

    const statusMap: Record<string, number> = {}
    executions.forEach((e) => { statusMap[e.status] = e._count.status })

    const totalExec = Object.values(statusMap).reduce((a, b) => a + b, 0)
    const pass = statusMap['PASS'] ?? 0
    const fail = statusMap['FAIL'] ?? 0
    const blocked = statusMap['BLOCKED'] ?? 0
    const skip = statusMap['SKIP'] ?? 0
    const notRun = statusMap['NOT_RUN'] ?? 0
    const executed = totalExec - notRun
    const passRate = executed > 0 ? Math.round((pass / executed) * 100) : 0

    return ok(reply, {
      totalTestCases: totalTc,
      totalRuns,
      executions: { total: totalExec, pass, fail, blocked, skip, notRun, executed, passRate },
    })
  })

  fastify.get('/bug-summary', auth, async (_request, reply) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, status: true, description: true },
    })

    const summary = await Promise.all(
      projects.map(async (p) => {
        const counts = await prisma.bug.groupBy({
          by: ['status'],
          where: { projectId: p.id },
          _count: { status: true },
        })

        const map: Record<string, number> = {}
        counts.forEach((c) => { map[c.status] = c._count.status })

        return {
          projectId: p.id,
          projectName: p.name,
          projectStatus: p.status,
          description: p.description,
          open: map['OPEN'] ?? 0,
          inProgress: map['IN_PROGRESS'] ?? 0,
          resolved: map['RESOLVED'] ?? 0,
          closed: map['CLOSED'] ?? 0,
          total: Object.values(map).reduce((a, b) => a + b, 0),
        }
      })
    )

    return ok(reply, summary)
  })

  fastify.get('/project-coverage', auth, async (_request, reply) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, status: true },
    })

    const stats = await Promise.all(
      projects.map(async (p) => {
        const testCases = await prisma.testCase.findMany({
          where: { projectId: p.id },
          select: {
            id: true,
            executions: {
              orderBy: { executedAt: 'desc' },
              take: 1,
              select: { status: true },
            },
          },
        })

        const counts = { pass: 0, fail: 0, skip: 0, blocked: 0, notRun: 0 }
        for (const tc of testCases) {
          const status = (tc.executions[0]?.status ?? 'NOT_RUN') as keyof typeof counts
          const key = status === 'NOT_RUN' ? 'notRun' : status.toLowerCase() as keyof typeof counts
          counts[key] = (counts[key] ?? 0) + 1
        }

        const total = testCases.length
        const executed = total - counts.notRun
        const passRate = executed > 0 ? Math.round((counts.pass / executed) * 100) : 0
        const coverage = total > 0 ? Math.round((executed / total) * 100) : 0

        return {
          projectId: p.id,
          projectName: p.name,
          projectStatus: p.status,
          total,
          pass: counts.pass,
          fail: counts.fail,
          skip: counts.skip,
          bugs: counts.blocked,
          todo: counts.notRun,
          executed,
          passRate,
          coverage,
        }
      })
    )

    return ok(reply, stats)
  })

  fastify.get('/coverage', auth, async (request, reply) => {
    const { suiteId } = request.query as { suiteId?: string }

    const testCases = await prisma.testCase.findMany({
      where: suiteId ? { suiteId } : {},
      select: {
        id: true,
        tcId: true,
        title: true,
        priority: true,
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    })

    const byPriority: Record<string, { total: number; executed: number }> = {}
    for (const tc of testCases) {
      const p = tc.priority
      if (!byPriority[p]) byPriority[p] = { total: 0, executed: 0 }
      byPriority[p].total++
      const lastStatus = tc.executions[0]?.status
      if (lastStatus && lastStatus !== 'NOT_RUN') byPriority[p].executed++
    }

    const total = testCases.length
    const executed = testCases.filter((tc) => {
      const s = tc.executions[0]?.status
      return s && s !== 'NOT_RUN'
    }).length

    return ok(reply, {
      total,
      executed,
      coveragePercent: total > 0 ? Math.round((executed / total) * 100) : 0,
      byPriority,
    })
  })

  fastify.get('/trend', auth, async (request, reply) => {
    const query = TrendQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const weeks = query.data.weeks
    const now = new Date()
    const points: Array<{
      week: string; pass: number; fail: number; blocked: number; total: number
    }> = []

    for (let i = weeks - 1; i >= 0; i--) {
      const from = new Date(now)
      from.setDate(from.getDate() - i * 7 - 7)
      from.setHours(0, 0, 0, 0)
      const to = new Date(now)
      to.setDate(to.getDate() - i * 7)
      to.setHours(23, 59, 59, 999)

      const execs = await prisma.execution.groupBy({
        by: ['status'],
        where: { executedAt: { gte: from, lte: to }, status: { not: 'NOT_RUN' } },
        _count: { status: true },
      })

      const map: Record<string, number> = {}
      execs.forEach((e) => { map[e.status] = e._count.status })

      points.push({
        week: from.toISOString().split('T')[0],
        pass: map['PASS'] ?? 0,
        fail: map['FAIL'] ?? 0,
        blocked: map['BLOCKED'] ?? 0,
        total: Object.values(map).reduce((a, b) => a + b, 0),
      })
    }

    return ok(reply, points)
  })
}
