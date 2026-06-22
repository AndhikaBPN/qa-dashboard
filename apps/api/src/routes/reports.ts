import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, badRequest } from '../lib/response.js'
import { z } from 'zod'

function getPeriodRange(period?: string, from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (from || to) {
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
    }
  }
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    return { gte: start, lte: now }
  }
  if (period === 'month') {
    const start = new Date(now)
    start.setDate(start.getDate() - 29)
    start.setHours(0, 0, 0, 0)
    return { gte: start, lte: now }
  }
  if (period === 'year') {
    const start = new Date(now)
    start.setFullYear(start.getFullYear() - 1)
    start.setHours(0, 0, 0, 0)
    return { gte: start, lte: now }
  }
  return undefined
}

const SummaryQuerySchema = z.object({
  period: z.enum(['week', 'month', 'year']).optional(),
  projectId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

const TrendQuerySchema = z.object({
  period: z.enum(['week', 'month', 'year']).default('month'),
  projectId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/summary', auth, async (request, reply) => {
    const query = SummaryQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const { period, projectId, from, to } = query.data
    const dateRange = getPeriodRange(period, from, to)

    const projectFilter = projectId ? { projectId } : {}

    const [totalTc, tcCreatedInPeriod, totalBugs, bugsInPeriod, totalRuns] = await prisma.$transaction([
      prisma.testCase.count({ where: { ...projectFilter } }),
      prisma.testCase.count({
        where: { ...projectFilter, ...(dateRange ? { createdAt: dateRange } : {}) },
      }),
      prisma.bug.count({ where: { ...projectFilter } }),
      prisma.bug.count({
        where: { ...projectFilter, ...(dateRange ? { createdAt: dateRange } : {}) },
      }),
      prisma.testRun.count({ where: { ...projectFilter, ...(dateRange ? { createdAt: dateRange } : {}) } }),
    ])

    const executions = await prisma.execution.groupBy({
      by: ['status'],
      where: {
        ...(projectId ? { testCase: { projectId } } : {}),
        ...(dateRange ? { executedAt: dateRange } : {}),
      },
      _count: { status: true },
    })

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
      tcCreatedInPeriod,
      totalBugs,
      bugsInPeriod,
      totalRuns,
      executions: { total: totalExec, pass, fail, blocked, skip, notRun, executed, passRate },
    })
  })

  fastify.get('/project-stats', auth, async (request, reply) => {
    const query = SummaryQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const { period, from, to } = query.data
    const dateRange = getPeriodRange(period, from, to)

    const projects = await prisma.project.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    })

    const stats = await Promise.all(
      projects.map(async (p) => {
        const [tcCount, tcInPeriod, bugCount, bugsInPeriod, openBugs] = await Promise.all([
          prisma.testCase.count({ where: { projectId: p.id } }),
          prisma.testCase.count({
            where: { projectId: p.id, ...(dateRange ? { createdAt: dateRange } : {}) },
          }),
          prisma.bug.count({ where: { projectId: p.id } }),
          prisma.bug.count({
            where: { projectId: p.id, ...(dateRange ? { createdAt: dateRange } : {}) },
          }),
          prisma.bug.count({ where: { projectId: p.id, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        ])

        const executions = await prisma.execution.groupBy({
          by: ['status'],
          where: {
            testCase: { projectId: p.id },
            ...(dateRange ? { executedAt: dateRange } : {}),
          },
          _count: { status: true },
        })

        const statusMap: Record<string, number> = {}
        executions.forEach((e) => { statusMap[e.status] = e._count.status })

        const totalExec = Object.values(statusMap).reduce((a, b) => a + b, 0)
        const pass = statusMap['PASS'] ?? 0
        const notRun = statusMap['NOT_RUN'] ?? 0
        const executed = totalExec - notRun
        const passRate = executed > 0 ? Math.round((pass / executed) * 100) : 0

        return {
          projectId: p.id,
          projectName: p.name,
          projectStatus: p.status,
          tcCount,
          tcInPeriod,
          executed,
          passRate,
          bugCount,
          bugsInPeriod,
          openBugs,
        }
      })
    )

    return ok(reply, stats)
  })

  fastify.get('/trend', auth, async (request, reply) => {
    const query = TrendQuerySchema.safeParse(request.query)
    if (!query.success) return badRequest(reply, query.error.message)

    const { period, projectId, from, to } = query.data
    const projectCondition = projectId ? { testCase: { projectId } } : {}

    type TrendPoint = { label: string; pass: number; fail: number; blocked: number; total: number }
    const points: TrendPoint[] = []

    const now = new Date()

    if (from || to) {
      // date range / single date — skip period check entirely, fall to weekly bucketing below
      const rangeFrom = from ? new Date(from) : (() => { const d = new Date(now); d.setDate(d.getDate() - 27); return d })()
      const rangeTo = to ? new Date(to + 'T23:59:59.999Z') : now
      const diffDays = Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (1000 * 60 * 60 * 24))
      const numWeeks = Math.max(1, Math.ceil(diffDays / 7))

      for (let i = 0; i < numWeeks; i++) {
        const start = new Date(rangeFrom)
        start.setDate(start.getDate() + i * 7)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        end.setHours(23, 59, 59, 999)
        if (end > rangeTo) end.setTime(rangeTo.getTime())

        const execs = await prisma.execution.groupBy({
          by: ['status'],
          where: { ...projectCondition, executedAt: { gte: start, lte: end }, status: { not: 'NOT_RUN' } },
          _count: { status: true },
        })

        const map: Record<string, number> = {}
        execs.forEach((e) => { map[e.status] = e._count.status })

        points.push({
          label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          pass: map['PASS'] ?? 0,
          fail: map['FAIL'] ?? 0,
          blocked: map['BLOCKED'] ?? 0,
          total: Object.values(map).reduce((a, b) => a + b, 0),
        })
      }

      return ok(reply, points)
    }

    if (period === 'week') {
      // Daily for last 7 days
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now)
        day.setDate(day.getDate() - i)
        const start = new Date(day); start.setHours(0, 0, 0, 0)
        const end = new Date(day); end.setHours(23, 59, 59, 999)

        const execs = await prisma.execution.groupBy({
          by: ['status'],
          where: { ...projectCondition, executedAt: { gte: start, lte: end }, status: { not: 'NOT_RUN' } },
          _count: { status: true },
        })

        const map: Record<string, number> = {}
        execs.forEach((e) => { map[e.status] = e._count.status })

        points.push({
          label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          pass: map['PASS'] ?? 0,
          fail: map['FAIL'] ?? 0,
          blocked: map['BLOCKED'] ?? 0,
          total: Object.values(map).reduce((a, b) => a + b, 0),
        })
      }
    } else if (period === 'month') {
      // Weekly for last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const end = new Date(now)
        end.setDate(end.getDate() - i * 7)
        end.setHours(23, 59, 59, 999)
        const start = new Date(end)
        start.setDate(start.getDate() - 6)
        start.setHours(0, 0, 0, 0)

        const execs = await prisma.execution.groupBy({
          by: ['status'],
          where: { ...projectCondition, executedAt: { gte: start, lte: end }, status: { not: 'NOT_RUN' } },
          _count: { status: true },
        })

        const map: Record<string, number> = {}
        execs.forEach((e) => { map[e.status] = e._count.status })

        points.push({
          label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          pass: map['PASS'] ?? 0,
          fail: map['FAIL'] ?? 0,
          blocked: map['BLOCKED'] ?? 0,
          total: Object.values(map).reduce((a, b) => a + b, 0),
        })
      }
    } else if (period === 'year') {
      // Monthly for last 12 months
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now)
        d.setMonth(d.getMonth() - i)
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)

        const execs = await prisma.execution.groupBy({
          by: ['status'],
          where: { ...projectCondition, executedAt: { gte: start, lte: end }, status: { not: 'NOT_RUN' } },
          _count: { status: true },
        })

        const map: Record<string, number> = {}
        execs.forEach((e) => { map[e.status] = e._count.status })

        points.push({
          label: start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          pass: map['PASS'] ?? 0,
          fail: map['FAIL'] ?? 0,
          blocked: map['BLOCKED'] ?? 0,
          total: Object.values(map).reduce((a, b) => a + b, 0),
        })
      }
    }

    return ok(reply, points)
  })

  fastify.get('/bugs-by-suite', auth, async (request, reply) => {
    const { projectId } = request.query as { projectId?: string }

    const bugs = await prisma.bug.findMany({
      where: projectId ? { projectId } : {},
      select: {
        status: true,
        severity: true,
        testCase: {
          select: {
            suiteId: true,
            suite: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Total status breakdown
    const totals = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, total: 0 }
    const suiteMap = new Map<string, {
      suiteId: string; suiteName: string
      OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number; total: number
    }>()

    for (const bug of bugs) {
      totals.total++
      totals[bug.status as keyof typeof totals] = (totals[bug.status as keyof typeof totals] as number) + 1

      const suiteId = bug.testCase?.suiteId ?? '__none__'
      const suiteName = bug.testCase?.suite?.name ?? '(No Suite)'

      if (!suiteMap.has(suiteId)) {
        suiteMap.set(suiteId, { suiteId, suiteName, OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, total: 0 })
      }
      const entry = suiteMap.get(suiteId)!
      entry.total++;
      (entry[bug.status as keyof typeof entry] as number)++
    }

    return ok(reply, {
      totals,
      bySuite: Array.from(suiteMap.values()).sort((a, b) => b.total - a.total),
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
          const rawStatus = tc.executions[0]?.status ?? 'NOT_RUN'
          if (rawStatus === 'NOT_RUN') {
            counts.notRun++
          } else {
            const key = rawStatus.toLowerCase() as 'pass' | 'fail' | 'skip' | 'blocked'
            counts[key] = (counts[key] ?? 0) + 1
          }
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

  fastify.get('/user-activity', auth, async (request, reply) => {
    const { projectId, from, to, weeks: weeksParam } = request.query as {
      projectId?: string; from?: string; to?: string; weeks?: string
    }

    const numWeeks = weeksParam ? Math.min(parseInt(weeksParam, 10), 12) : 4
    const now = new Date()

    let rangeEnd: Date
    let rangeStart: Date

    if (from && to) {
      rangeStart = new Date(from); rangeStart.setHours(0, 0, 0, 0)
      rangeEnd = new Date(to + 'T23:59:59.999Z')
    } else {
      rangeEnd = new Date(now); rangeEnd.setHours(23, 59, 59, 999)
      rangeStart = new Date(rangeEnd)
      rangeStart.setDate(rangeStart.getDate() - (numWeeks * 7 - 1))
      rangeStart.setHours(0, 0, 0, 0)
    }

    // Build weekly buckets starting from Monday-aligned weeks
    const buckets: { label: string; from: Date; to: Date }[] = []
    const cursor = new Date(rangeStart)
    while (cursor <= rangeEnd) {
      const weekStart = new Date(cursor)
      const weekEnd = new Date(cursor)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      if (weekEnd > rangeEnd) weekEnd.setTime(rangeEnd.getTime())
      buckets.push({
        label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        from: new Date(weekStart),
        to: new Date(weekEnd),
      })
      cursor.setDate(cursor.getDate() + 7)
    }

    const pf = projectId ? { projectId } : {}

    const [tcCreated, tcUpdated, executions, bugs, users] = await prisma.$transaction([
      prisma.testCase.findMany({
        where: { ...pf, createdAt: { gte: rangeStart, lte: rangeEnd } },
        select: { authorId: true, createdAt: true },
      }),
      prisma.testCase.findMany({
        where: { ...pf, updatedById: { not: null }, updatedAt: { gte: rangeStart, lte: rangeEnd } },
        select: { updatedById: true, updatedAt: true },
      }),
      prisma.execution.findMany({
        where: {
          ...(projectId ? { testCase: { projectId } } : {}),
          executedAt: { gte: rangeStart, lte: rangeEnd },
          status: { not: 'NOT_RUN' },
        },
        select: { executorId: true, executedAt: true },
      }),
      prisma.bug.findMany({
        where: { ...pf, createdAt: { gte: rangeStart, lte: rangeEnd } },
        select: { reporterId: true, createdAt: true },
      }),
      prisma.user.findMany({ where: { role: 'QA' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])

    function bucketIndex(date: Date): number {
      for (let i = 0; i < buckets.length; i++) {
        if (date >= buckets[i].from && date <= buckets[i].to) return i
      }
      return -1
    }

    type Week = { created: number; updated: number; executed: number; defects: number }
    const userMap = new Map<string, { name: string; weeks: Week[] }>()
    for (const u of users) {
      userMap.set(u.id, { name: u.name, weeks: buckets.map(() => ({ created: 0, updated: 0, executed: 0, defects: 0 })) })
    }

    for (const tc of tcCreated) {
      const i = bucketIndex(tc.createdAt)
      if (i >= 0) userMap.get(tc.authorId)?.weeks[i] && (userMap.get(tc.authorId)!.weeks[i].created++)
    }
    for (const tc of tcUpdated) {
      if (!tc.updatedById) continue
      const i = bucketIndex(tc.updatedAt)
      if (i >= 0) userMap.get(tc.updatedById)?.weeks[i] && (userMap.get(tc.updatedById)!.weeks[i].updated++)
    }
    for (const exec of executions) {
      const i = bucketIndex(exec.executedAt)
      if (i >= 0) userMap.get(exec.executorId)?.weeks[i] && (userMap.get(exec.executorId)!.weeks[i].executed++)
    }
    for (const bug of bugs) {
      const i = bucketIndex(bug.createdAt)
      if (i >= 0) userMap.get(bug.reporterId)?.weeks[i] && (userMap.get(bug.reporterId)!.weeks[i].defects++)
    }

    const result = Array.from(userMap.entries()).map(([userId, u]) => {
      const totals = u.weeks.reduce(
        (acc, w) => ({ created: acc.created + w.created, updated: acc.updated + w.updated, executed: acc.executed + w.executed, defects: acc.defects + w.defects }),
        { created: 0, updated: 0, executed: 0, defects: 0 }
      )
      return { userId, userName: u.name, weeks: u.weeks, totals }
    })

    const weekTotals = buckets.map((_, i) =>
      result.reduce(
        (acc, u) => ({ created: acc.created + u.weeks[i].created, updated: acc.updated + u.weeks[i].updated, executed: acc.executed + u.weeks[i].executed, defects: acc.defects + u.weeks[i].defects }),
        { created: 0, updated: 0, executed: 0, defects: 0 }
      )
    )

    const overallTotals = weekTotals.reduce(
      (acc, w) => ({ created: acc.created + w.created, updated: acc.updated + w.updated, executed: acc.executed + w.executed, defects: acc.defects + w.defects }),
      { created: 0, updated: 0, executed: 0, defects: 0 }
    )

    return ok(reply, {
      weeks: buckets.map((b) => ({ label: b.label, from: b.from.toISOString(), to: b.to.toISOString() })),
      users: result,
      weekTotals,
      overallTotals,
    })
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
}
