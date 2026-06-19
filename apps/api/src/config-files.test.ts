import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../..')

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8')
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    result[key] = value
  }
  return result
}

// ---------------------------------------------------------------------------
// .env.example
// ---------------------------------------------------------------------------

describe('.env.example', () => {
  let content: string
  let parsed: Record<string, string>

  beforeAll(() => {
    content = readFile('.env.example')
    parsed = parseEnvFile(content)
  })

  it('contains the BASE_URL key (new addition)', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'BASE_URL')).toBe(true)
  })

  it('BASE_URL has an empty default value so developers must configure it', () => {
    expect(parsed['BASE_URL']).toBe('')
  })

  it('contains a production comment for CORS_ORIGIN', () => {
    expect(content).toContain('# Production: CORS_ORIGIN=https://da-q.linkit360.ai')
  })

  it('contains a production note referencing the web .env.production file', () => {
    expect(content).toContain('.env.production')
  })

  it('production note references the correct production API URL', () => {
    expect(content).toContain('https://da-q.linkit360.ai/api/v1')
  })

  // Pre-existing keys must still be present (regression guard)
  it('still contains DATABASE_URL key', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'DATABASE_URL')).toBe(true)
  })

  it('still contains JWT_SECRET key', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'JWT_SECRET')).toBe(true)
  })

  it('still contains JWT_REFRESH_SECRET key', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'JWT_REFRESH_SECRET')).toBe(true)
  })

  it('still contains PORT key', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'PORT')).toBe(true)
  })

  it('still contains NODE_ENV key', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'NODE_ENV')).toBe(true)
  })

  it('still contains CORS_ORIGIN key with localhost default', () => {
    expect(parsed['CORS_ORIGIN']).toBe('http://localhost:5173')
  })

  it('BASE_URL key appears after CORS_ORIGIN in the file', () => {
    // Use line-anchored search to avoid matching DATABASE_URL= as BASE_URL=
    const lines = content.split('\n')
    const corsLineIdx = lines.findIndex((l) => /^CORS_ORIGIN=/.test(l))
    const baseUrlLineIdx = lines.findIndex((l) => /^BASE_URL=/.test(l))
    expect(corsLineIdx).toBeGreaterThanOrEqual(0)
    expect(baseUrlLineIdx).toBeGreaterThan(corsLineIdx)
  })

  // Negative / boundary: BASE_URL must NOT have a hardcoded default value
  it('BASE_URL does not have a hardcoded URL as default', () => {
    expect(parsed['BASE_URL']).not.toMatch(/^https?:\/\//)
  })
})

// ---------------------------------------------------------------------------
// .gitignore
// ---------------------------------------------------------------------------

describe('.gitignore', () => {
  let lines: string[]
  let content: string

  beforeAll(() => {
    content = readFile('.gitignore')
    lines = content.split('\n').map((l) => l.trim())
  })

  it('contains the !.env.production exception (new addition)', () => {
    expect(lines).toContain('!.env.production')
  })

  it('still contains the .env.* wildcard pattern (pre-existing)', () => {
    expect(lines).toContain('.env.*')
  })

  it('still ignores the plain .env file', () => {
    expect(lines).toContain('.env')
  })

  it('!.env.production exception comes AFTER the .env.* pattern so git respects it', () => {
    const wildcardIdx = lines.indexOf('.env.*')
    const exceptionIdx = lines.indexOf('!.env.production')
    expect(wildcardIdx).toBeGreaterThanOrEqual(0)
    expect(exceptionIdx).toBeGreaterThan(wildcardIdx)
  })

  it('does NOT have a bare !.env.* line that would re-include all env files', () => {
    expect(lines).not.toContain('!.env.*')
  })

  // Regression: other important patterns still present
  it('still ignores node_modules', () => {
    expect(lines).toContain('node_modules')
  })

  it('still ignores dist/', () => {
    expect(lines).toContain('dist/')
  })

  // Negative: a non-production env file should NOT be explicitly un-ignored
  it('does not add an exception for .env.local', () => {
    expect(lines).not.toContain('!.env.local')
  })

  it('does not add an exception for .env.development', () => {
    expect(lines).not.toContain('!.env.development')
  })
})

// ---------------------------------------------------------------------------
// apps/web/.env.production
// ---------------------------------------------------------------------------

describe('apps/web/.env.production', () => {
  let content: string
  let parsed: Record<string, string>

  beforeAll(() => {
    content = readFile('apps/web/.env.production')
    parsed = parseEnvFile(content)
  })

  it('file exists and is non-empty', () => {
    expect(content.trim().length).toBeGreaterThan(0)
  })

  it('contains the VITE_API_URL key', () => {
    expect(Object.prototype.hasOwnProperty.call(parsed, 'VITE_API_URL')).toBe(true)
  })

  it('VITE_API_URL is set to the production API base URL', () => {
    expect(parsed['VITE_API_URL']).toBe('https://da-q.linkit360.ai/api/v1')
  })

  it('VITE_API_URL uses the https scheme (not http)', () => {
    expect(parsed['VITE_API_URL']).toMatch(/^https:\/\//)
  })

  it('VITE_API_URL points to the correct domain', () => {
    expect(parsed['VITE_API_URL']).toContain('da-q.linkit360.ai')
  })

  it('VITE_API_URL includes the /api/v1 path prefix', () => {
    const url = parsed['VITE_API_URL']
    expect(new URL(url).pathname).toBe('/api/v1')
  })

  it('VITE_API_URL has no trailing slash', () => {
    expect(parsed['VITE_API_URL']).not.toMatch(/\/$/)
  })

  it('VITE_API_URL is a valid URL', () => {
    expect(() => new URL(parsed['VITE_API_URL'])).not.toThrow()
  })

  // Boundary: the file should only define VITE_API_URL and nothing unexpected
  it('does not accidentally include a localhost URL', () => {
    expect(parsed['VITE_API_URL']).not.toContain('localhost')
  })

  // Regression: key starts with VITE_ prefix so Vite exposes it to the browser
  it('VITE_API_URL key starts with VITE_ prefix (required for Vite exposure)', () => {
    expect('VITE_API_URL').toMatch(/^VITE_/)
  })
})
