import { prisma } from '../lib/prisma.js';
import { ok, created, noContent, badRequest, notFound, pageMeta } from '../lib/response.js';
import { BugCreateSchema, BugUpdateSchema, BugQuerySchema } from '../types/schemas.js';
async function generateBugId() {
    const last = await prisma.bug.findFirst({ orderBy: { bugId: 'desc' } });
    if (!last)
        return 'BUG-001';
    const num = parseInt(last.bugId.replace('BUG-', ''), 10);
    return `BUG-${String(num + 1).padStart(3, '0')}`;
}
export const bugRoutes = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] };
    fastify.get('/', auth, async (request, reply) => {
        const query = BugQuerySchema.safeParse(request.query);
        if (!query.success)
            return badRequest(reply, query.error.message);
        const { projectId, status, severity, priority, search, page, limit } = query.data;
        const skip = (page - 1) * limit;
        const where = {
            ...(projectId && { projectId }),
            ...(status && { status }),
            ...(severity && { severity }),
            ...(priority && { priority }),
            ...(search && {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { bugId: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };
        const [total, items] = await prisma.$transaction([
            prisma.bug.count({ where }),
            prisma.bug.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    reporter: { select: { id: true, name: true } },
                    assignee: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true } },
                    testCase: { select: { id: true, tcId: true, title: true, suiteId: true } },
                },
            }),
        ]);
        return ok(reply, items, pageMeta(total, page, limit));
    });
    fastify.post('/', auth, async (request, reply) => {
        const body = BugCreateSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const project = await prisma.project.findUnique({ where: { id: body.data.projectId } });
        if (!project)
            return notFound(reply, 'Project not found');
        const bugId = await generateBugId();
        const bug = await prisma.bug.create({
            data: {
                ...body.data,
                bugId,
                steps: body.data.steps,
                reporterId: request.user.sub,
            },
            include: {
                reporter: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } },
                testCase: { select: { id: true, tcId: true, title: true } },
            },
        });
        return created(reply, bug);
    });
    fastify.get('/:id', auth, async (request, reply) => {
        const { id } = request.params;
        const bug = await prisma.bug.findUnique({
            where: { id },
            include: {
                reporter: { select: { id: true, name: true, email: true } },
                assignee: { select: { id: true, name: true, email: true } },
                project: { select: { id: true, name: true } },
                testCase: { select: { id: true, tcId: true, title: true } },
            },
        });
        if (!bug)
            return notFound(reply);
        return ok(reply, bug);
    });
    fastify.put('/:id', auth, async (request, reply) => {
        const { id } = request.params;
        const body = BugUpdateSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const existing = await prisma.bug.findUnique({ where: { id } });
        if (!existing)
            return notFound(reply);
        const bug = await prisma.bug.update({
            where: { id },
            data: {
                ...body.data,
                steps: body.data.steps,
                assigneeId: body.data.assigneeId === null ? null : body.data.assigneeId,
                testCaseId: body.data.testCaseId === null ? null : body.data.testCaseId,
            },
            include: {
                reporter: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } },
                testCase: { select: { id: true, tcId: true, title: true } },
            },
        });
        return ok(reply, bug);
    });
    fastify.delete('/:id', auth, async (request, reply) => {
        const { id } = request.params;
        const existing = await prisma.bug.findUnique({ where: { id } });
        if (!existing)
            return notFound(reply);
        await prisma.bug.delete({ where: { id } });
        return noContent(reply);
    });
};
