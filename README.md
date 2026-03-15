# Reconix Backend

Reconix Backend is a robust API and synchronization engine built with Node.js, Express, and PostgreSQL, using Prisma as the ORM.

## 🚀 Tech Stack

- **Runtime:** [Node.js (v20+)](https://nodejs.org/)
- **Framework:** [Express.js](https://expressjs.com/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **ORM:** [Prisma](https://www.prisma.io/)
- **Database:** [PostgreSQL](https://www.postgresql.org/)
- **Validation:** [Zod](https://zod.dev/)
- **Authentication:** JWT (JSON Web Tokens)
- **Planned/Optional:** [Redis](https://redis.io/) & [BullMQ](https://docs.bullmq.io/) (for background jobs/sync)

## 📂 Project Structure

```text
Reconix-Backend/
├── prisma/             # Database schema and migrations
├── src/
│   ├── modules/        # Domain-driven modules (auth, user, company)
│   ├── routes/         # Express route definitions
│   ├── config/         # App configuration (env, prisma, logger)
│   ├── middlewares/    # Custom Express middlewares
│   ├── types/          # Global type definitions
│   ├── utils/          # Utility functions
│   ├── app.ts          # Express app configuration
│   └── server.ts       # Server entry point
├── .env.example        # Environment variables template
└── Dockerfile          # Production container setup
```

## 🛠️ Setup

1. **Environment Variables:**
   Copy `.env.example` to `.env` and configure your `DATABASE_URL`.
   ```bash
   cp .env.example .env
   ```

2. **Database Setup:**
   Ensure PostgreSQL is running. Then install dependencies and run migrations:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   ```

3. **Development:**
   Start the development server with live reload:
   ```bash
   npm run dev
   ```

## 📖 API Documentation

The API uses OpenAPI 3.0 (Swagger) for documentation.
- **Swagger UI:** `http://localhost:3000/api-docs`
- **Raw Spec:** `GET /api-docs/spec.json`

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with live reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled production app |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run lint` | Run ESLint check |
| `npm run format` | Format code with Prettier |

## 🏁 Phase 1 Status - ✅ COMPLETE

- [x] Project setup & folder structure
- [x] Database schema & Prisma configuration
- [x] Core Modules implementation (Auth, User, Company)
- [x] JWT Authentication & RBAC
- [x] Xero OAuth 2.0 Integration
- [x] Xero Data Synchronization Engine

## 🏁 Phase 2 Status - ✅ COMPLETE

- [x] Job CRUD APIs (Create, List, Detail, Delete)
- [x] Job Item Management (Bulk add, Remove, Acknowledge)
- [x] Job Approval Workflow
- [x] Automation Job Engine (BullMQ Workers)
- [x] Invoice Reversal Logic (via Xero Credit Notes)
- [x] Overpayment Allocation Logic (via Xero Allocations)
- [x] Advanced Data Query APIs (Searching, Sorting, Pagination, Filtering)
