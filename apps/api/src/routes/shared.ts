import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, notFound } from '../lib/response.js'

export const sharedRoutes: FastifyPluginAsync = async (fastify) => {
  // Public — no auth required
  fastify.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string }

    const run = await prisma.testRun.findUnique({
      where: { shareToken: token },
      include: {
        suite: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        executions: {
          include: {
            testCase: {
              select: {
                id: true, tcId: true, title: true, priority: true,
                type: true, scenarioType: true, expectedResult: true,
              },
            },
          },
          orderBy: { testCase: { tcId: 'asc' } },
        },
      },
    })

    if (!run || !run.shareToken) return notFound(reply)

    // Compute progress
    const statusCounts: Record<string, number> = {}
    for (const exec of run.executions) {
      statusCounts[exec.status] = (statusCounts[exec.status] ?? 0) + 1
    }
    const total = run.executions.length
    const pass = statusCounts['PASS'] ?? 0
    const fail = statusCounts['FAIL'] ?? 0
    const blocked = statusCounts['BLOCKED'] ?? 0
    const skip = statusCounts['SKIP'] ?? 0
    const notRun = statusCounts['NOT_RUN'] ?? 0
    const executed = total - notRun
    const passRate = executed > 0 ? Math.round((pass / executed) * 100) : 0

    return ok(reply, {
      id: run.id,
      name: run.name,
      suite: run.suite,
      project: run.project,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      progress: { total, pass, fail, blocked, skip, notRun, executed, passRate },
      executions: run.executions,
    })
  })
}
