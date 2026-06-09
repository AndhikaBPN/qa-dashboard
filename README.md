# QA Hub

Internal tool untuk manajemen test case tim QA — pengganti AIO Test (Jira). Self-hosted, free tier.

**Stack:** React 18 + Vite · Fastify · PostgreSQL · Prisma · pnpm monorepo

---

## Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9 — `npm install -g pnpm`
- PostgreSQL ≥ 14 (lokal atau Docker)

---

## Clone & Install

```bash
git clone <repo-url> qa-hub
cd qa-hub
pnpm install
```

---

## Setup Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/qa_hub
JWT_SECRET=ganti_dengan_random_string_32_char
JWT_REFRESH_SECRET=ganti_dengan_random_string_lain
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

Buat file `apps/web/.env`:

```env
VITE_API_URL=http://localhost:3001/api/v1
```

> **Jira integration (opsional)** — tambahkan ke `apps/api/.env`:
>
> ```env
> JIRA_BASE_URL=https://yourorg.atlassian.net
> JIRA_EMAIL=your@email.com
> JIRA_API_TOKEN=your_api_token
> ```

---

## Setup Database

Pastikan PostgreSQL berjalan, lalu:

```bash
# Buat database
createdb qa_hub

# Migration + generate Prisma client
pnpm db:migrate

# Seed data awal
pnpm db:seed
```

---

## Jalankan Dev Server

```bash
pnpm dev
```

Menjalankan keduanya bersamaan:

| Service            | URL                                   |
|--------------------|---------------------------------------|
| Frontend (Vite)    | <http://localhost:5173>               |
| Backend (Fastify)  | <http://localhost:3001>               |

Atau jalankan terpisah:

```bash
pnpm --filter api dev   # backend only
pnpm --filter web dev   # frontend only
```

---

## Build Production

```bash
pnpm build
```

Output:

- `apps/api/dist/` — compiled JS
- `apps/web/dist/` — static files

Jalankan production:

```bash
node apps/api/dist/app.js
```

---

## Testing

```bash
pnpm test       # unit tests (Vitest)
pnpm test:e2e   # e2e tests (Playwright)
```

---

## Struktur Monorepo

```text
qa-hub/
├── apps/
│   ├── api/          # Fastify backend
│   └── web/          # React frontend (Vite)
├── packages/
│   └── shared/       # Shared types & Zod schemas
├── prisma/
│   └── schema.prisma
├── .env.example
└── package.json
```

---

## Default Login (setelah seed)

| Email                  | Password  | Role  |
|------------------------|-----------|-------|
| admin@qa-hub.local     | admin123  | ADMIN |
| qa@qa-hub.local        | qa123     | QA    |

> Ganti password setelah login pertama.

---

## Troubleshooting

### `prisma migrate dev` gagal

- Cek `DATABASE_URL` di `apps/api/.env`
- Pastikan PostgreSQL berjalan dan database sudah dibuat

### Port conflict

- API: ubah `PORT` di `apps/api/.env`
- Web: ubah `--port` di script dev Vite atau tambah `server.port` di `vite.config.ts`

### `pnpm install` error

- Pastikan Node.js ≥ 18: `node --version`
- Hapus `node_modules` + lockfile lalu install ulang:

```bash
find . -name node_modules -type d -prune -exec rm -rf {} +
rm pnpm-lock.yaml
pnpm install
```
