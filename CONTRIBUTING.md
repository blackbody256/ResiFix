# Contributing to ResiFix

Five people are building this in parallel, so most of these rules exist to stop people from blocking each other.

## Who owns what

| Area          | Server module (NestJS)     | Client screen                  | Owner         | Backlog                                |
| ------------- | -------------------------- | ------------------------------ | ------------- | -------------------------------------- |
| Auth          | `server/src/auth`          | `client/src/screens/Login.tsx` | Ann           | PB-001, PB-002                         |
| Properties    | `server/src/properties`    | `screens/Properties.tsx`       | Amabe         | PB-003, PB-004                         |
| Reporting     | `server/src/reporting`     | `screens/Reporting.tsx`        | Amabe / Ayan  | PB-005..PB-009                         |
| Tickets       | `server/src/tickets`       | `screens/Tickets.tsx`          | Ayan          | PB-010, PB-011, PB-020, PB-022, PB-023 |
| Custodian     | `server/src/custodian`     | `screens/Custodian.tsx`        | Andrew        | PB-012..PB-018, PB-024                 |
| Completion    | `server/src/completion`    | `screens/Completion.tsx`       | Selina        | PB-019, PB-021, PB-025..PB-029         |
| Notifications | `server/src/notifications` | `client/src/lib/push.ts`       | Ayan / Andrew | PB-023, PB-024                         |

Each module's controller has an `// OWNER:` tag and a TODO list of its backlog IDs. Tick an item off in the PR that finishes it.

Do your work inside your own module. If you need to change something shared, open a PR for that change on its own.

## Shared files: changed only by PR to Ann

These files are the contract between everyone's work. Change them only in a PR assigned to **Ann** for review, and keep that PR separate from feature work:

- `prisma/schema.prisma` and everything in `prisma/migrations/`
- `docs/api-contract.md` (endpoint shapes, error format)
- `server/src/common/` (guards, `PropertyScope`, `ticket-status.ts`, error filter)
- `server/src/auth/guards/`, `server/src/queue/queue.constants.ts`

If you need a new column, open the schema PR first (with its migration, from `npm run migrate -- --name <change>`) and build your feature on top of it once it is merged.

## Branches

```
feature/PB-0xx-short-name     e.g. feature/PB-005-report-fault
fix/PB-0xx-short-name         bug fix on an existing story
chore/short-name              tooling, docs, refactors
```

Branch from `main`, and rebase on `main` before opening a PR. Each branch covers one backlog item.

## Pull requests

- Every PR is reviewed and approved by **Ann or Andrew** before merge. Do not merge your own PR.
- CI must pass: lint, typecheck, migrations, seed, the unit and e2e tests, both builds, the API smoke test and the Docker image builds.
- Put the backlog ID in the title: `PB-005: Resident can report a fault`.
- In the description: what changed, how to test it, and screenshots for any UI change.

## Definition of Done

A backlog item is done when **all** of these are true:

1. **Meets the acceptance criteria** written on the backlog item.
2. **Tested**: you exercised the happy path and the main error cases (wrong role, other property's data, bad input), and every new endpoint has an e2e test covering them (see [server/test/README.md](server/test/README.md)).
3. **Demoed**: shown working to at least one other teammate, end to end through the client.
4. Merged to `main` with CI green and the TODO line in your controller ticked off.

## Running locally

Prerequisites: Node 22.12+ and Docker.

```bash
cp .env.example .env          # defaults work with docker-compose
npm install                   # also runs `prisma generate`
npm run infra:up              # Postgres :5432, Redis :6379, MinIO :9000 (console :9001)
npm run migrate               # apply migrations
npm run seed                  # two demo properties, users, tickets in every status
npm run dev                   # API :3000 (with the queue worker inline), app http://localhost:5173
```

Log in with any seeded phone number. In development the OTP is always **123456**, and the API also prints it to its log.

| Role      | Kikoni Demo Hostel          | Mitchell Hall (demo)       |
| --------- | --------------------------- | -------------------------- |
| Custodian | 0700 000 001, 0700 000 003  | 0700 000 101               |
| Admin     | 0700 000 002                | 0700 000 102               |
| Resident  | 0700 000 010 – 0700 000 013 | 0700 000 110, 0700 000 111 |

| Command                            | What it does                                                     |
| ---------------------------------- | ---------------------------------------------------------------- |
| `npm run lint` / `npm run format`  | ESLint + Prettier check / fix                                    |
| `npm run typecheck`                | TypeScript for server and client                                 |
| `npm test`                         | Server unit + e2e tests (`test:unit` / `test:e2e` for one kind)  |
| `npm run build`                    | Build the API (`server/dist`) and the PWA (`client/dist`)        |
| `npm run start:worker`             | Run the BullMQ worker on its own (set `RUN_WORKER_INLINE=false`) |
| `npm run db:reset`                 | Drop, re-migrate and re-seed                                     |
| `npm run studio`                   | Prisma Studio                                                    |
| `npm run vapid:generate -w server` | Make VAPID keys for Web Push; paste them into `.env`             |
| `npm run stack:up`                 | Whole stack in Docker behind Nginx at http://localhost:8080      |

Web Push only works in a production build (`npm run build -w client && npm run preview -w client`), because the service worker is disabled in `vite dev`.

## Server conventions (NestJS)

- **Guards are global.** Every route requires a JWT unless it is marked `@Public()`. Restrict roles with `@Roles(Role.ADMIN, ...)` on the controller or handler. Get the caller with `@CurrentUser()`.
- **Data isolation.** Take `@Scope() scope: PropertyScope` and pass every property-owned query through it: `where: scope.where<Prisma.TicketWhereInput>({...}, via?)`, `data: scope.data({...})`. Never trust a `propertyId` sent by the client.
- **Errors.** Throw `notFound()`, `badRequest(...)` and so on from `common/app-exception.ts`, or `notImplemented('PB-0xx')` for a stub. The global filter renders `{ error: { code, message, details } }`.
- **Validation.** Validate bodies with zod: `@Body(new ZodValidationPipe(Schema)) body: z.infer<typeof Schema>`.
- **Status changes.** Use `assertTransition(from, to)` from `common/ticket-status.ts`, and record each change with `AuditService.record(..., tx)` inside the same `prisma.$transaction`.
- **Background work.** Never `setTimeout` in a request. Use `TicketTimersService` (response deadlines, 48-hour auto-close) and `NotificationsService.notify()`; the worker in `server/src/worker/` runs them.
- **Photos.** Use `StorageService`: store the object key in `Photo.url` and give clients `presignedGetUrl(key)` links, never raw bucket URLs.
- **Prisma.** Inject `PrismaService`. Never call `new PrismaClient()`.
- **DI imports.** Import injected classes as values (`import { PrismaService } ...`), not `import type`, or Nest cannot resolve them.

## Client conventions (React)

- Call the API only through `client/src/lib/api.ts` (or the `useApi` hook). It attaches the JWT and logs the user out on 401.
- One screen per feature area in `client/src/screens/`, registered in `client/src/features.tsx` with its roles.
- Style with Tailwind utility classes. Shared building blocks go in `client/src/components/ui.tsx`.
