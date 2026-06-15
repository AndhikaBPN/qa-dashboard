import { prisma } from '../lib/prisma.js';
import { ok, badRequest, notFound } from '../lib/response.js';
import { JiraLinkSchema } from '../types/schemas.js';
function jiraHeaders() {
    const token = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}
export const jiraRoutes = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] };
    fastify.get('/issues/:key', auth, async (request, reply) => {
        const { key } = request.params;
        if (!process.env.JIRA_BASE_URL)
            return badRequest(reply, 'Jira integration not configured');
        const res = await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/issue/${key}`, {
            headers: jiraHeaders(),
        });
        if (res.status === 404)
            return notFound(reply, `Jira issue ${key} not found`);
        if (!res.ok)
            return badRequest(reply, `Jira API error: ${res.statusText}`);
        const issue = await res.json();
        return ok(reply, {
            key: issue.key,
            summary: issue.fields?.summary,
            status: issue.fields?.status?.name,
            issueType: issue.fields?.issuetype?.name,
            assignee: issue.fields?.assignee?.displayName ?? null,
            url: `${process.env.JIRA_BASE_URL}/browse/${issue.key}`,
        });
    });
    fastify.post('/link', auth, async (request, reply) => {
        const body = JiraLinkSchema.safeParse(request.body);
        if (!body.success)
            return badRequest(reply, body.error.message);
        const tc = await prisma.testCase.findUnique({ where: { id: body.data.testCaseId } });
        if (!tc)
            return notFound(reply, 'Test case not found');
        const updated = await prisma.testCase.update({
            where: { id: body.data.testCaseId },
            data: { jiraIssueKey: body.data.jiraIssueKey },
            select: { id: true, tcId: true, jiraIssueKey: true },
        });
        return ok(reply, updated);
    });
    fastify.delete('/link/:testCaseId', auth, async (request, reply) => {
        const { testCaseId } = request.params;
        const tc = await prisma.testCase.findUnique({ where: { id: testCaseId } });
        if (!tc)
            return notFound(reply, 'Test case not found');
        const updated = await prisma.testCase.update({
            where: { id: testCaseId },
            data: { jiraIssueKey: null },
            select: { id: true, tcId: true, jiraIssueKey: true },
        });
        return ok(reply, updated);
    });
};
