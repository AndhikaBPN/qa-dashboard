import { prisma } from '../lib/prisma.js';
import { ok, created, noContent, badRequest, notFound } from '../lib/response.js';
import { SuiteCreateSchema, SuiteUpdateSchema } from '../types/schemas.js';
async function buildTree(suites) {
    const map = new Map(suites.map((s) => [s.id, { ...s, children: [] }]));
    const roots = [];
    for (const suite of map.values()) {
        if (suite.parentId)
            map.get(suite.parentId)?.children.push(suite);
        else
            roots.push(suite);
    }
    return roots.sort((a, b) => a.orderIndex - b.orderIndex);
}
export const suiteRoutes = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] };
    fastify.get('/', auth, async (request, reply) => {
        const { projectId, type } = request.query;
        const suites = await prisma.testSuite.findMany({
            where: {
                ...(projectId && { projectId }),
                ...(type && { type: type }),
            },
            orderBy: { orderIndex: 'asc' },
            include: { _count: { select: { testCases: true } } },
        });
        return ok(reply, await buildTree(suites));
    });
    fastify.post('/', auth, async (request, reply) => {
        const body = SuiteCreateSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        if (body.data.parentId) {
            const parent = await prisma.testSuite.findUnique({ where: { id: body.data.parentId } });
            if (!parent)
                return notFound(reply, 'Parent suite not found');
        }
        const lastSibling = await prisma.testSuite.findFirst({
            where: { parentId: body.data.parentId ?? null },
            orderBy: { orderIndex: 'desc' },
        });
        const suite = await prisma.testSuite.create({
            data: {
                name: body.data.name,
                parentId: body.data.parentId,
                projectId: body.data.projectId,
                type: body.data.type,
                orderIndex: (lastSibling?.orderIndex ?? -1) + 1,
            },
        });
        return created(reply, suite);
    });
    fastify.get('/:id', auth, async (request, reply) => {
        const { id } = request.params;
        const suite = await prisma.testSuite.findUnique({
            where: { id },
            include: { children: true, _count: { select: { testCases: true } } },
        });
        if (!suite)
            return notFound(reply);
        return ok(reply, suite);
    });
    fastify.put('/:id', auth, async (request, reply) => {
        const { id } = request.params;
        const body = SuiteUpdateSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const existing = await prisma.testSuite.findUnique({ where: { id } });
        if (!existing)
            return notFound(reply);
        if (body.data.parentId && body.data.parentId === id) {
            return badRequest(reply, 'Suite cannot be its own parent');
        }
        const suite = await prisma.testSuite.update({ where: { id }, data: body.data });
        return ok(reply, suite);
    });
    fastify.delete('/:id', auth, async (request, reply) => {
        const { id } = request.params;
        const suite = await prisma.testSuite.findUnique({
            where: { id },
            include: { _count: { select: { children: true, testCases: true } } },
        });
        if (!suite)
            return notFound(reply);
        if (suite._count.children > 0 || suite._count.testCases > 0) {
            return badRequest(reply, 'Suite has children or test cases — move them first');
        }
        await prisma.testSuite.delete({ where: { id } });
        return noContent(reply);
    });
    fastify.get('/:id/test-cases', auth, async (request, reply) => {
        const { id } = request.params;
        const suite = await prisma.testSuite.findUnique({ where: { id } });
        if (!suite)
            return notFound(reply);
        const testCases = await prisma.testCase.findMany({
            where: { suiteId: id },
            orderBy: { createdAt: 'desc' },
            include: { author: { select: { id: true, name: true } } },
        });
        return ok(reply, testCases);
    });
};
