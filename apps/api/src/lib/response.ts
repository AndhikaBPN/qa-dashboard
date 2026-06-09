import type { FastifyReply } from 'fastify'

export function ok<T>(reply: FastifyReply, data: T, meta?: Record<string, unknown>) {
  return reply.code(200).send({ data, ...(meta ? { meta } : {}) })
}

export function created<T>(reply: FastifyReply, data: T) {
  return reply.code(201).send({ data })
}

export function noContent(reply: FastifyReply) {
  return reply.code(204).send()
}

export function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: 'BAD_REQUEST', message })
}

export function unauthorized(reply: FastifyReply, message = 'Unauthorized') {
  return reply.code(401).send({ error: 'UNAUTHORIZED', message })
}

export function forbidden(reply: FastifyReply, message = 'Forbidden') {
  return reply.code(403).send({ error: 'FORBIDDEN', message })
}

export function notFound(reply: FastifyReply, message = 'Not found') {
  return reply.code(404).send({ error: 'NOT_FOUND', message })
}

export function conflict(reply: FastifyReply, message: string) {
  return reply.code(409).send({ error: 'CONFLICT', message })
}

export function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) }
}
