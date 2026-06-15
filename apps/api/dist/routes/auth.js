import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { ok, badRequest, unauthorized } from '../lib/response.js';
import { signAccess, signRefresh, verifyRefresh } from '../middleware/auth.js';
import { LoginSchema, RefreshSchema } from '../types/schemas.js';
export const authRoutes = async (fastify) => {
    // POST /auth/login
    fastify.post('/login', async (request, reply) => {
        const body = LoginSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const user = await prisma.user.findUnique({ where: { email: body.data.email } });
        if (!user)
            return unauthorized(reply, 'Invalid credentials');
        const valid = await bcrypt.compare(body.data.password, user.passwordHash);
        if (!valid)
            return unauthorized(reply, 'Invalid credentials');
        const payload = { sub: user.id, email: user.email, role: user.role };
        return ok(reply, {
            accessToken: signAccess(payload),
            refreshToken: signRefresh(payload),
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    });
    // POST /auth/refresh
    fastify.post('/refresh', async (request, reply) => {
        const body = RefreshSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        try {
            const payload = verifyRefresh(body.data.refreshToken);
            if (payload.type !== 'refresh')
                return unauthorized(reply, 'Invalid token type');
            const user = await prisma.user.findUnique({ where: { id: payload.sub } });
            if (!user)
                return unauthorized(reply, 'User not found');
            const newPayload = { sub: user.id, email: user.email, role: user.role };
            return ok(reply, {
                accessToken: signAccess(newPayload),
                refreshToken: signRefresh(newPayload),
            });
        }
        catch {
            return unauthorized(reply, 'Invalid or expired refresh token');
        }
    });
    // POST /auth/logout
    fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
        return reply.code(204).send();
    });
    // GET /auth/me
    fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const user = await prisma.user.findUnique({
            where: { id: request.user.sub },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });
        if (!user)
            return unauthorized(reply);
        return ok(reply, user);
    });
};
