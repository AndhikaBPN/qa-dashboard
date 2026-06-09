import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import jwt from 'jsonwebtoken'
import { unauthorized } from '../lib/response.js'

export interface JwtPayload {
  sub: string
  email: string
  role: string
  type: 'access' | 'refresh'
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return unauthorized(reply)

    const token = header.slice(7)
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
      if (payload.type !== 'access') return unauthorized(reply, 'Invalid token type')
      request.user = payload
    } catch {
      return unauthorized(reply, 'Invalid or expired token')
    }
  })

  fastify.decorate('requireRole', (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!roles.includes(request.user?.role)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' })
      }
    }
  })
}

export function signAccess(payload: Omit<JwtPayload, 'type'>) {
  return jwt.sign({ ...payload, type: 'access' }, process.env.JWT_SECRET!, { expiresIn: '15m' })
}

export function signRefresh(payload: Omit<JwtPayload, 'type'>) {
  return jwt.sign({ ...payload, type: 'refresh' }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' })
}

export function verifyRefresh(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload
}

export default fp(authPlugin)
