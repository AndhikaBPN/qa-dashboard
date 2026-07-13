import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ok, created, noContent, badRequest, notFound } from '../lib/response.js'
import { ProjectCreateSchema, ProjectUpdateSchema } from '../types/schemas.js'

function buildAbbreviation(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.map(w => w[0].toUpperCase()).join('')
  return initials.length >= 2 ? initials : name.slice(0, 2).toUpperCase().padEnd(2, 'X')
}

async function resolveUniqueAbbreviation(base: string, excludeId?: string): Promise<string> {
  let abbr = base
  let i = 2
  while (true) {
    const exists = await prisma.project.findFirst({
      where: { abbreviation: abbr, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    })
    if (!exists) return abbr
    abbr = base + i++
  }
}

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.get('/', auth, async (_request, reply) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { testSuites: true, testCases: true, testRuns: true } },
      },
    })
    return ok(reply, projects)
  })

  fastify.post('/', auth, async (request, reply) => {
    const body = ProjectCreateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const base = buildAbbreviation(body.data.name)
    const abbreviation = await resolveUniqueAbbreviation(base)
    const project = await prisma.project.create({ data: { ...body.data, abbreviation } })
    return created(reply, project)
  })

  fastify.get('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: { select: { testSuites: true, testCases: true, testRuns: true } },
      },
    })
    if (!project) return notFound(reply)
    return ok(reply, project)
  })

  fastify.put('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ProjectUpdateSchema.safeParse(request.body)
    if (!body.success) return badRequest(reply, body.error.message)

    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) return notFound(reply)

    const project = await prisma.project.update({ where: { id }, data: body.data })
    return ok(reply, project)
  })

  fastify.delete('/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { testSuites: true, testCases: true } } },
    })
    if (!existing) return notFound(reply)

    if (existing._count.testSuites > 0 || existing._count.testCases > 0) {
      return badRequest(reply, 'Project has suites or test cases — remove them first')
    }

    await prisma.project.delete({ where: { id } })
    return noContent(reply)
  })
}
