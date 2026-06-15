import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../lib/response.js';
const authPlugin = async (fastify) => {
    fastify.decorate('authenticate', async (request, reply) => {
        const header = request.headers.authorization;
        if (!header?.startsWith('Bearer '))
            return unauthorized(reply);
        const token = header.slice(7);
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            if (payload.type !== 'access')
                return unauthorized(reply, 'Invalid token type');
            request.user = payload;
        }
        catch {
            return unauthorized(reply, 'Invalid or expired token');
        }
    });
    fastify.decorate('requireRole', (roles) => {
        return async (request, reply) => {
            if (!roles.includes(request.user?.role)) {
                return reply.code(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
            }
        };
    });
};
export function signAccess(payload) {
    return jwt.sign({ ...payload, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}
export function signRefresh(payload) {
    return jwt.sign({ ...payload, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}
export function verifyRefresh(token) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
export default fp(authPlugin);
