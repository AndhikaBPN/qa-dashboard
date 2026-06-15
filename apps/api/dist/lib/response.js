export function ok(reply, data, meta) {
    return reply.code(200).send({ data, ...(meta ? { meta } : {}) });
}
export function created(reply, data) {
    return reply.code(201).send({ data });
}
export function noContent(reply) {
    return reply.code(204).send();
}
export function badRequest(reply, message) {
    return reply.code(400).send({ error: 'BAD_REQUEST', message });
}
export function unauthorized(reply, message = 'Unauthorized') {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message });
}
export function forbidden(reply, message = 'Forbidden') {
    return reply.code(403).send({ error: 'FORBIDDEN', message });
}
export function notFound(reply, message = 'Not found') {
    return reply.code(404).send({ error: 'NOT_FOUND', message });
}
export function conflict(reply, message) {
    return reply.code(409).send({ error: 'CONFLICT', message });
}
export function pageMeta(total, page, limit) {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
}
