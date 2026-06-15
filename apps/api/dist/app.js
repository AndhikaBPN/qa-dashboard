import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import jwt from 'jsonwebtoken';
import authPlugin from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { userRoutes } from './routes/users.js';
import { bugRoutes } from './routes/bugs.js';
import { suiteRoutes } from './routes/suites.js';
import { testCaseRoutes } from './routes/testCases.js';
import { testRunRoutes } from './routes/testRuns.js';
import { executionRoutes } from './routes/executions.js';
import { reportRoutes } from './routes/reports.js';
import { jiraRoutes } from './routes/jira.js';
export async function buildApp() {
    const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });
    await app.register(cors, {
        origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
        credentials: true,
    });
    await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
    await app.register(authPlugin);
    app.setErrorHandler((error, _request, reply) => {
        app.log.error(error);
        if (error.validation) {
            return reply.code(400).send({ error: 'VALIDATION_ERROR', message: error.message });
        }
        const isDev = process.env.NODE_ENV !== 'production';
        return reply.code(500).send({
            error: 'INTERNAL_ERROR',
            message: isDev ? error.message : 'Something went wrong',
        });
    });
    // Block VIEWER role from all write operations globally.
    // Runs before each route's preHandler; reads the token directly so it doesn't
    // depend on authenticate having already set request.user.
    const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    app.addHook('preHandler', async (request, reply) => {
        if (!WRITE_METHODS.has(request.method))
            return;
        const header = request.headers.authorization;
        if (!header?.startsWith('Bearer '))
            return; // let authenticate handle 401
        try {
            const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
            if (payload.type === 'access' && payload.role === 'VIEWER') {
                return reply.code(403).send({ error: 'FORBIDDEN', message: 'Viewers cannot modify data' });
            }
        }
        catch {
            // invalid token — let route-level authenticate handle the 401
        }
    });
    const PREFIX = '/api/v1';
    app.register(authRoutes, { prefix: `${PREFIX}/auth` });
    app.register(projectRoutes, { prefix: `${PREFIX}/projects` });
    app.register(userRoutes, { prefix: `${PREFIX}/users` });
    app.register(bugRoutes, { prefix: `${PREFIX}/bugs` });
    app.register(suiteRoutes, { prefix: `${PREFIX}/suites` });
    app.register(testCaseRoutes, { prefix: `${PREFIX}/test-cases` });
    app.register(testRunRoutes, { prefix: `${PREFIX}/test-runs` });
    app.register(executionRoutes, { prefix: `${PREFIX}/executions` });
    app.register(reportRoutes, { prefix: `${PREFIX}/reports` });
    app.register(jiraRoutes, { prefix: `${PREFIX}/jira` });
    app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
    return app;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
    const app = await buildApp();
    await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
}
