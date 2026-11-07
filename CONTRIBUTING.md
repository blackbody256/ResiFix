# Contributing to ResiFix

Five people are building this in parallel, so most of these rules exist to stop people from blocking each other.

## Who owns what

| Area       | Server folder                    | Client screen                 | Owner        | Backlog                                |
| ---------- | -------------------------------- | ----------------------------- | ------------ | -------------------------------------- |
| Auth       | `server/src/features/auth`       | `client/src/screens/login.js` | Ann          | PB-001, PB-002                         |
| Properties | `server/src/features/properties` | `screens/properties.js`       | Amabe        | PB-003, PB-004                         |
| Reporting  | `server/src/features/reporting`  | `screens/reporting.js`        | Amabe / Ayan | PB-005..PB-009                         |
| Tickets    | `server/src/features/tickets`    | `screens/tickets.js`          | Ayan         | PB-010, PB-011, PB-020, PB-022, PB-023 |
| Custodian  | `server/src/features/custodian`  | `screens/custodian.js`        | Andrew       | PB-012..PB-018, PB-024                 |
| Completion | `server/src/features/completion` | `screens/completion.js`       | Selina       | PB-019, PB-021, PB-025..PB-029         |

Do your work inside your own feature folder. If you need to change something shared, open a PR for that change on its own.

## Shared files: changed only by PR to Ann

These files are the contract between everyone's work. Change them only in a PR assigned to **Ann** for review, and keep that PR separate from feature work:

- `prisma/schema.prisma` and everything in `prisma/migrations/`
- `docs/api-contract.md` (endpoint shapes, error format)
- `server/src/lib/ticketStatus.js` (allowed status transitions)
- `server/src/lib/scope.js`, `server/src/middleware/auth.js`

If you need a new column, open the schema PR first (with its migration) and build your feature on top of it once it is merged.

## Branches

```
feature/PB-0xx-short-name     e.g. feature/PB-005-report-fault
fix/PB-0xx-short-name         bug fix on an existing story
chore/short-name              tooling, docs, refactors
```

Branch from `main`, and rebase on `main` before opening a PR. Each branch covers one backlog item.

## Pull requests

- Every PR is reviewed and approved by **Ann or Andrew** before merge. Do not merge your own PR.
- CI must pass: lint, migrations, seed, client build and API smoke test.
- Put the backlog ID in the title: `PB-005: Resident can report a fault`.
- In the description: what changed, how to test it, and screenshots for any UI change.

## Definition of Done

A backlog item is done when **all** of these are true:

1. **Meets the acceptance criteria** written on the backlog item.
2. **Tested**: you exercised the happy path and the main error cases (wrong role, other property's data, bad input). Add automated tests where practical.
3. **Demoed**: shown working to at least one other teammate, end to end through the client.
4. Merged to `main` with CI green and the `TODO` line in your routes file ticked off.

## Running locally

Prerequisites: Node 20.12+ and Docker (or a local PostgreSQL 16).

```bash
cp .env.example .env          # defaults work with docker-compose
npm install
npm run db:up                 # Postgres in Docker on :5432
npm run migrate               # apply migrations + generate Prisma client
npm run seed                  # demo hostel, users, fault catalogue
npm run dev                   # API on :3000, client on http://localhost:5173
```

Log in with any seeded phone number. In development the OTP is always **123456**, and the server also prints it to its log.

| Role      | Phone                       |
| --------- | --------------------------- |
| Custodian | 0700 000 001                |
| Admin     | 0700 000 002                |
| Resident  | 0700 000 010 – 0700 000 013 |

Other scripts: `npm run lint`, `npm run format`, `npm run db:reset` (drop, re-migrate and re-seed), `npm run studio` (Prisma Studio).

## Server conventions

- **Data isolation.** Every query for property-owned data goes through `scopeToProperty(req.user, query, via?)`, and every create goes through `withProperty(req.user, data)`. Never trust a `propertyId` sent by the client.
- **Auth.** Put `authenticate` on the router and `requireRole('ADMIN', ...)` on each route that needs it.
- **Errors.** `throw notFound()`, `throw badRequest(...)` and so on, from `lib/httpError.js`. Express 5 passes thrown errors and rejected promises to the central handler, so routes do not need try/catch.
- **Validation.** Validate request bodies with zod: `parse(schema, req.body)`.
- **Status changes.** Use `assertTransition(from, to)`. Record each change with `recordAudit(...)`, inside the same `prisma.$transaction`.
- **Prisma client.** Use the single client exported from `server/src/db.js`. Never call `new PrismaClient()` anywhere else.

## Client conventions

- Call the API only through `client/src/api.js`. It attaches the JWT and handles 401s.
- Each screen is an `async (el, ctx) => {}` function under `client/src/screens/` and is registered in `client/src/routes.js`.
- Escape all server data with `escapeHtml()` before putting it into `innerHTML`.
