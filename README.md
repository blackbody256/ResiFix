# ResiFix

ResiFix is a web-based maintenance management and accountability platform for university halls of residence and private student hostels, starting with the Makerere University cluster in Kampala. Residents report faults from their phones, custodians schedule and prove repairs, and every ticket is tracked against a response-time target until the resident confirms the fix.

## Stack

| Layer           | Technology                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| Backend         | Node.js + NestJS 12 (TypeScript)                                                  |
| Frontend        | React 19 + Vite + Tailwind CSS 4, installable PWA (Workbox via vite-plugin-pwa)   |
| Database        | PostgreSQL 16 via Prisma 6                                                        |
| Cache and queue | Redis 7 + BullMQ: response-time timers, 48-hour auto-close, notification delivery |
| File storage    | S3-compatible (MinIO locally); photos served through expiring presigned links     |
| Auth            | Phone + OTP login, JWT sessions, role guards (resident, custodian, admin)         |
| Notifications   | Web Push (VAPID) with Africa's Talking SMS fallback                               |
| Deploy          | Docker + Nginx reverse proxy; Sentry for error reporting                          |

Chart.js is reserved for the analytics work later.

## How it fits together

```
Browser (React PWA, service worker)
        |  /api
      Nginx  -----------------  serves the built PWA
        |
   NestJS API  ----  PostgreSQL (Prisma)
        |       \---  MinIO / S3 (photos, presigned links)
      Redis (BullMQ queues)
        |
   Worker  ----  Web Push / Africa's Talking SMS
```

In local development the API and the React dev server run on your machine, and only Postgres, Redis and MinIO run in Docker. The queue worker runs inside the API process (`RUN_WORKER_INLINE=true`).

## Repository layout

```
server/            NestJS API and BullMQ worker
  src/auth/          phone OTP, JWT, global guards               (Ann)
  src/properties/    blocks, rooms, occupancy                    (Amabe)
  src/reporting/     fault catalogue, reports, photos            (Amabe / Ayan)
  src/tickets/       ticket list, detail, timeline               (Ayan)
  src/custodian/     targets, work queue, review, visits         (Andrew)
  src/completion/    proof of repair, verify, auto-close, stats  (Selina)
  src/notifications/ Web Push + SMS fallback                     (Ayan / Andrew)
  src/queue/ src/worker/  BullMQ queues and job processors
  src/storage/       S3 / MinIO client
  src/common/        guards, PropertyScope, ticket lifecycle, errors (shared)
client/            React PWA: screens in src/screens/, API client in src/lib/api.ts
prisma/            schema.prisma, migrations, seed.js
deploy/nginx/      Nginx config (serves the PWA, proxies /api)
docs/              api-contract.md
```

## Quick start

Prerequisites: Node 22.12+ and Docker.

```bash
cp .env.example .env
npm install                 # also generates the Prisma client
npm run infra:up            # Postgres, Redis, MinIO in Docker
npm run migrate             # apply migrations
npm run seed                # two demo properties, users and tickets in every status
npm run dev                 # API http://localhost:3000/api, app http://localhost:5173
```

Sign in with a seeded phone number. In development the OTP is always **123456** and the API prints it to its log.

| Role      | Kikoni Demo Hostel (Block A / B) | Mitchell Hall (demo) (Wing 1 / 2) |
| --------- | -------------------------------- | --------------------------------- |
| Resident  | 0700 000 010 to 0700 000 013     | 0700 000 110, 0700 000 111        |
| Custodian | 0700 000 001, 0700 000 003       | 0700 000 101                      |
| Admin     | 0700 000 002                     | 0700 000 102                      |

The Kikoni hostel has a ticket at every stage of the lifecycle (an overdue urgent report, a missed visit, work in progress, a repair awaiting confirmation, a reopened one and a closed, rated one), with visits and status history. Times are relative to when you seeded, so re-run `npm run seed` to refresh them. The second property is there to check data isolation.

### If Docker images will not pull

- `pull access denied for minio/minio`: MinIO no longer publishes images. `docker-compose.yml` now uses `pgsty/minio`, a community build of the same server; pull the latest `main`.
- `toomanyrequests: ... pull rate limit`: Docker Hub allows 100 anonymous pulls an hour per IP address, and campus Wi-Fi shares one address. Run `docker login` with a free Docker Hub account, or pull once on mobile data.
- When one image fails, Compose cancels the others, so the error you see first may not be the real one. Pull one at a time to find it: `docker compose pull db`, then `redis`, then `minio`.

### Services and ports

| Service         | URL                       | Notes                                     |
| --------------- | ------------------------- | ----------------------------------------- |
| React app (dev) | http://localhost:5173     | proxies `/api` to the API                 |
| API             | http://localhost:3000/api | health check at `/api/health`             |
| PostgreSQL      | localhost:5432            | user / password / db: `resifix`           |
| Redis           | localhost:6379            |                                           |
| MinIO S3 API    | http://localhost:9000     | bucket `resifix-photos`, created on start |
| MinIO console   | http://localhost:9001     | `resifix` / `resifix-secret`              |
| Full stack      | http://localhost:8080     | `npm run stack:up`: Nginx + API + worker  |

### Optional integrations

Everything runs without these. Fill them in `.env` when you need them:

- **Web Push:** run `npm run vapid:generate -w server` and paste the keys into `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. Push only works in a production build of the client (`npm run build -w client && npm run preview -w client`).
- **SMS (Africa's Talking):** set `AT_USERNAME`, `AT_API_KEY` and `AT_SANDBOX`. Without them, SMS messages are logged instead of sent.
- **Sentry:** set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (client).

## Scripts

| Command                           | What it does                                                |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | API (with the worker inline) and React dev server together  |
| `npm run build`                   | Build the API (`server/dist`) and the PWA (`client/dist`)   |
| `npm run start`                   | Run the built API                                           |
| `npm run start:worker`            | Run the queue worker on its own (`RUN_WORKER_INLINE=false`) |
| `npm run lint`                    | ESLint + Prettier check (`npm run format` fixes formatting) |
| `npm run check:commits`           | Check your branch's commits for AI or co-author lines       |
| `npm run typecheck`               | TypeScript for server and client                            |
| `npm test`                        | Server unit + e2e tests (needs `infra:up`; see below)       |
| `npm run infra:up` / `infra:down` | Start / stop Postgres, Redis and MinIO                      |
| `npm run stack:up`                | Build and run the whole stack in Docker behind Nginx        |
| `npm run migrate`                 | Apply migrations; `-- --name <change>` creates a new one    |
| `npm run seed`                    | Reset demo data                                             |
| `npm run db:reset`                | Drop, re-migrate and re-seed                                |
| `npm run studio`                  | Prisma Studio                                               |

## Tests

`npm test` runs the server tests with [Vitest](https://vitest.dev): unit tests next to the code (`server/src/**/*.spec.ts`) and HTTP tests against the real app (`server/test/**/*.e2e-spec.ts`). The e2e tests need `npm run infra:up`, and use their own database (`resifix_test`, created automatically), Redis DB 15 and photo bucket, so your demo data is never touched. CI runs them on every PR. How to write one: [server/test/README.md](server/test/README.md).

## API contract

The endpoints, error format, roles, ticket lifecycle and background jobs are in [docs/api-contract.md](docs/api-contract.md). The [shared API contract doc](https://claude.ai/artifact/Xzq6Y8Ays5yDGKPZkLwp5s) has the same contract plus proposed shapes and a build status for every endpoint still to be built. Changes to the contract or the Prisma schema go through a PR to Ann.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for who owns what, branch naming (`feature/PB-0xx-short-name`), reviews, the Definition of Done and coding conventions.
