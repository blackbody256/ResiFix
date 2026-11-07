# ResiFix

ResiFix is a web-based maintenance management and accountability platform for university halls of residence and private student hostels, starting with the Makerere University cluster in Kampala.

## Stack

| Layer           | Technology                                                          |
| --------------- | ------------------------------------------------------------------- |
| Backend         | Node.js + NestJS (TypeScript)                                       |
| Frontend        | React + Vite + Tailwind CSS, as a PWA (Workbox via vite-plugin-pwa) |
| Database        | PostgreSQL via Prisma                                               |
| Cache and queue | Redis + BullMQ                                                      |
| File storage    | S3-compatible (MinIO locally), served via expiring presigned links  |
| Auth            | JWT + phone OTP                                                     |
| Notifications   | Web Push (VAPID) with Africa's Talking SMS fallback                 |
| Deploy          | Docker + Nginx reverse proxy; Sentry for error reporting            |

Chart.js is reserved for the analytics work later.

```
server/          NestJS API + BullMQ worker. One module per feature area under src/
client/          React PWA. Screens under src/screens/, API client in src/lib/api.ts
prisma/          schema.prisma, migrations, seed.js
deploy/nginx/    Nginx config (serves the PWA, proxies /api)
docs/            api-contract.md (shared API contract)
```

## Quick start

Prerequisites: Node 22.12+ and Docker.

```bash
cp .env.example .env
npm install                 # also generates the Prisma client
npm run infra:up            # Postgres :5432, Redis :6379, MinIO :9000 (console :9001)
npm run migrate             # apply migrations
npm run seed                # demo hostel and users
npm run dev                 # API http://localhost:3000/api, app http://localhost:5173
```

In development the OTP is always **123456**. Log in as a resident with 0700 000 010.

To run everything in containers behind Nginx: `npm run stack:up`, then open http://localhost:8080.

See [CONTRIBUTING.md](CONTRIBUTING.md) for ownership, branching, the Definition of Done and conventions.
