# Reconix-Backend

Xero Automation Web App — API and sync engine (Node.js + Express + PostgreSQL + Redis + BullMQ).

## Repository layout

This repo is the **backend** only. The frontend lives in **Reconix-Frontend** (separate git repo).

## Folder structure

```
Reconix-Backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── openapi/        # OpenAPI 3.0 spec (Swagger docs)
│   ├── config/         # env, prisma client, logger
│   ├── routes/         # Mounts under /api/v1
│   ├── modules/        # auth, user (more in later phases)
│   ├── middlewares/
│   ├── helpers/
│   ├── utils/
│   └── types/
├── .env.example
├── tsconfig.json
├── eslint.config.js
├── Dockerfile
└── docker-compose.yml
```

## Setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (PostgreSQL).
2. Start Postgres (and Redis when needed) locally or via Docker:
   ```bash
   docker compose up db redis -d
   ```
3. Install and generate Prisma client:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   ```
4. Run the app:
   ```bash
   npm run dev
   ```

API base: `http://localhost:3000/api/v1` (e.g. `GET /api/v1/health`).

**API documentation (Swagger):** `http://localhost:3000/api-docs` — OpenAPI 3.0 spec for health and auth (login/register), with SOC2-aligned descriptions and security schemes. Raw spec: `GET /api-docs/spec.json`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled app |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run migrations (dev) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

## Phase 1 status

- [x] Folder structure and project setup
- [ ] Database schema & migrations (Task 2)
- [ ] Auth — JWT + RBAC (Task 3)
- [ ] Xero OAuth 2.0 (Task 4)
