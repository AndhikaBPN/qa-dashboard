import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, badRequest, notFound } from '../lib/response.js'
import { ExecutionUpdateSchema, BulkExecutionUpdateSchema } from '../types/schemas.js'

export const executionRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/', auth, async (request, reply) => {
    const { testRunId, testCaseId } = request.query as Record<string, string>
    if (!testRunId && !testCaseId) return badRequest(reply, 'testRunId or testCaseId required')

    const executions = await prisma.execution.findMany({
      where: {
        ...(testRunId && { testRunId }),
        ...(testCaseId && { testCaseId }),
      },
      include: {
        testCase: { select: { id: true, tcId: true, title: true, priority: true, type: true } },
        executor: { select: { id: true, name: true } },
      },
      orderBy: { executedAt: 'desc' },
    })
    return ok(reply, executions)
  })

  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: {
        testCase: true,
        testRun: { select: { id: true, name: true } },
        executor: { select: { id: true, name: true } },
      },
    })
    if (!execution) return notFound(reply)
    return ok(reply, execution)
  })

  fastify.put('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ExecutionUpdateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const existing = await prisma.execution.findUnique({ where: { id } })
    if (!existing) return notFound(reply)

    const execution = await prisma.execution.update({
      where: { id },
      data: {
        status: body.data.status,
        actualResult: body.data.actualResult,
        evidence: body.data.evidence ? (body.data.evidence as any) : undefined,
        executorId: request.user.sub,
        executedAt: new Date(),
      },
      include: {
        testCase: { select: { id: true, tcId: true, title: true } },
        executor: { select: { id: true, name: true } },
      },
    })
    return ok(reply, execution)
  })

  fastify.post('/bulk-update', auth, async (request, reply) => {
    const body = BulkExecutionUpdateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const result = await prisma.execution.updateMany({
      where: { id: { in: body.data.ids } },
      data: {
        status: body.data.status,
        executorId: request.user.sub,
        executedAt: new Date(),
      },
    })
    return ok(reply, { updated: result.count })
  })
}
