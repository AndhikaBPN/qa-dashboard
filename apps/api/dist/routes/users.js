import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { ok, created, noContent, badRequest, notFound } from '../lib/response.js';
import { UserCreateSchema, UserUpdateSchema } from '../types/schemas.js';
export const userRoutes = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] };
    const adminOnly = { preHandler: [fastify.authenticate, fastify.requireRole(['ADMIN'])] };
    // GET /users — any authenticated user (for pickers etc.)
    fastify.get('/', auth, async (_request, reply) => {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, createdAt: true },
            orderBy: { name: 'asc' },
        });
        return ok(reply, users);
    });
    // POST /users — ADMIN only: create a new user
    fastify.post('/', adminOnly, async (request, reply) => {
        const body = UserCreateSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const existing = await prisma.user.findUnique({ where: { email: body.data.email } });
        if (existing)
            return badRequest(reply, 'Email already in use');
        const passwordHash = await bcrypt.hash(body.data.password, 10);
        const user = await prisma.user.create({
            data: { email: body.data.email, name: body.data.name, passwordHash, role: body.data.role },
            select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        return created(reply, user);
    });
    // PUT /users/:id — ADMIN only: update name, role, or password
    fastify.put('/:id', adminOnly, async (request, reply) => {
        const { id } = request.params;
        const body = UserUpdateSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing)
            return notFound(reply);
        const data = {};
        if (body.data.name)
            data.name = body.data.name;
        if (body.data.role)
            data.role = body.data.role;
        if (body.data.password)
            data.passwordHash = await bcrypt.hash(body.data.password, 10);
        const user = await prisma.user.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        return ok(reply, user);
    });
    // DELETE /users/:id — ADMIN only
    fastify.delete('/:id', adminOnly, async (request, reply) => {
        const { id } = request.params;
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing)
            return notFound(reply);
        // Prevent deleting yourself
        if (id === request.user.sub)
            return badRequest(reply, 'Cannot delete your own account');
        await prisma.user.delete({ where: { id } });
        return noContent(reply);
    });
};
