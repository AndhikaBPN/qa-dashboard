import type { FastifyPluginAsync } from 'fastify'
import { createWriteStream, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { randomBytes } from 'crypto'
import { pipeline } from 'stream/promises'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads')

// ensure dir exists at startup
mkdirSync(UPLOAD_DIR, { recursive: true })

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.post('/', auth, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'BAD_REQUEST', message: 'No file uploaded' })

    const ext = extname(data.filename) || ''
    const filename = `${randomBytes(16).toString('hex')}${ext}`
    const dest = join(UPLOAD_DIR, filename)

    await pipeline(data.file, createWriteStream(dest))

    const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`
    return reply.code(201).send({ url: `${baseUrl}/uploads/${filename}`, filename, mimetype: data.mimetype })
  })
}
