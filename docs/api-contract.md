# ResiFix API contract

> Shared contract: change only by PR to Ann. Add your endpoint here **in the same PR** that implements it.
> The [shared API contract doc](https://claude.ai/artifact/Xzq6Y8Ays5yDGKPZkLwp5s) mirrors this file and adds proposed shapes and a build status for each endpoint still to be built.

Base path: `/api`. JSON in and out. Every route needs `Authorization: Bearer <jwt>` unless marked **public** below.

## Conventions

- **Success**: a JSON object whose top-level key names the resource: `{ "ticket": {...} }` or `{ "tickets": [...] }`.
- **Error**: `{ "error": { "code": "NOT_FOUND", "message": "Human readable", "details": <optional> } }`

| Status | code                | When                                                  |
| ------ | ------------------- | ----------------------------------------------------- |
| 400    | `VALIDATION_FAILED` | body failed zod validation (`details` = field errors) |
| 400    | `BAD_REQUEST`       | other client error                                    |
| 400    | `BAD_JSON`          | body is not valid JSON                                |
| 401    | `UNAUTHORIZED`      | missing/invalid/expired token, wrong OTP              |
| 403    | `FORBIDDEN`         | wrong role                                            |
| 404    | `NOT_FOUND`         | no such record, **or it belongs to another property** |
| 409    | `CONFLICT`          | illegal status transition, duplicate record           |
| 413    | `PAYLOAD_TOO_LARGE` | upload over the size limit                            |
| 429    | `TOO_MANY_REQUESTS` | too many OTP attempts                                 |
| 501    | `NOT_IMPLEMENTED`   | stub route, backlog item not built yet                |

- IDs are cuid strings. Timestamps are ISO 8601 UTC.
- Phone numbers are stored in E.164 format (`+256700000010`). The API also accepts `0700 000 010`.
- Every response carries an `x-request-id` header. Include it in bug reports.

## Ticket lifecycle

Defined in `server/src/common/ticket-status.ts`:

```
REPORTED -> REVIEWED | CLOSED
REVIEWED -> SCHEDULED | ASSIGNED | CLOSED
SCHEDULED -> ASSIGNED | IN_PROGRESS
ASSIGNED -> SCHEDULED | IN_PROGRESS
IN_PROGRESS -> COMPLETED
COMPLETED -> STUDENT_CONFIRMED | REOPENED | CLOSED   (CLOSED automatically after 48h, PB-021)
STUDENT_CONFIRMED -> CLOSED
CLOSED -> REOPENED
REOPENED -> REVIEWED | SCHEDULED | ASSIGNED
```

## Background jobs (BullMQ)

| Queue           | Job                 | Scheduled by                                   | Effect                                                        |
| --------------- | ------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `ticket-timers` | `response-deadline` | `TicketTimersService.scheduleResponseDeadline` | Ticket still unattended at `dueAt`: audit + alert admins      |
| `ticket-timers` | `auto-close`        | `TicketTimersService.scheduleAutoClose`        | Still `COMPLETED` after 48h: `CLOSED`, audit, notify (PB-021) |
| `notifications` | `deliver`           | `NotificationsService.notify`                  | Web Push to each subscribed device, else SMS (PB-023/024)     |

## Endpoints

### Implemented

| Method | Path                                | Auth     | Request                                          | Response                                                     |
| ------ | ----------------------------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------ |
| GET    | `/health`                           | public   | –                                                | `{ status, db, redis, time }` (503 if DB down)               |
| POST   | `/auth/request-otp`                 | public   | `{ phone }`                                      | `{ phone, expiresInSeconds }`                                |
| POST   | `/auth/verify-otp`                  | public   | `{ phone, code }`                                | `{ token, user: { id, propertyId, phone, name, role } }`     |
| GET    | `/auth/me`                          | any      | –                                                | `{ user }`                                                   |
| GET    | `/properties/mine`                  | any      | –                                                | `{ property: { ..., blocks: [{ ..., rooms }] } }`            |
| GET    | `/reporting/fault-categories`       | any      | –                                                | `{ categories: [{ ..., items }] }`                           |
| POST   | `/reporting/tickets/:id/photos`     | RESIDENT | multipart, field `photo` (JPEG/PNG/WebP, ≤ 5 MB) | `{ photo: { id, kind, createdAt } }`                         |
| GET    | `/reporting/photos/:photoId/link`   | any      | –                                                | `{ url, expiresAt }`: presigned link; residents: own tickets |
| GET    | `/tickets`                          | any      | –                                                | `{ tickets }`. Residents see only their own tickets.         |
| GET    | `/tickets/:id`                      | any      | –                                                | `{ ticket }` with photos, visits, proof, `timeline` (PB-010) |
| GET    | `/notifications`                    | any      | –                                                | `{ notifications }`: caller's latest 50                      |
| GET    | `/notifications/push/public-key`    | public   | –                                                | `{ publicKey }` (null when Web Push is not configured)       |
| POST   | `/notifications/push/subscriptions` | any      | `PushSubscription.toJSON()`                      | `{ subscribed: true }`                                       |
| DELETE | `/notifications/push/subscriptions` | any      | `{ endpoint }`                                   | `{ subscribed: false }`                                      |

### Stubs (return 501 until built)

| Method | Path                                  | Role             | Backlog |
| ------ | ------------------------------------- | ---------------- | ------- |
| POST   | `/properties/blocks`                  | ADMIN            | PB-003  |
| POST   | `/properties/blocks/:blockId/rooms`   | ADMIN            | PB-003  |
| POST   | `/properties/occupancies`             | ADMIN            | PB-004  |
| POST   | `/reporting/tickets`                  | RESIDENT         | PB-005  |
| POST   | `/tickets/:id/review`                 | ADMIN            | PB-011  |
| POST   | `/tickets/:id/status`                 | ADMIN, CUSTODIAN | PB-020  |
| GET    | `/custodian/queue`                    | CUSTODIAN, ADMIN | PB-012  |
| POST   | `/custodian/tickets/:id/assign`       | CUSTODIAN, ADMIN | PB-013  |
| POST   | `/custodian/tickets/:id/visits`       | CUSTODIAN, ADMIN | PB-014  |
| POST   | `/custodian/visits/:visitId/missed`   | CUSTODIAN, ADMIN | PB-016  |
| POST   | `/custodian/tickets/:id/repair-proof` | CUSTODIAN, ADMIN | PB-018  |
| POST   | `/completion/tickets/:id/verify`      | RESIDENT         | PB-019  |
| POST   | `/completion/tickets/:id/rating`      | RESIDENT         | PB-025  |

### `GET /tickets/:id` (PB-010)

Same visibility as the list: residents get **404** for tickets they did not report; staff see any ticket in their property. The `ticket` object has the ticket's own fields plus:

- `room` (with `block`), `faultItem` (with `category`), `reporter { id, name, phone }`, `assignee { id, name, role } | null`
- `photos`: the resident's report photos, `[{ id, kind, url, urlExpiresAt, createdAt }]`. `url` is a presigned link; fetch the ticket again after `urlExpiresAt`.
- `visits` (with `custodian`), `repairProofs` (with `submittedBy` and their own `photos`), `verifications` (with `user`), `rating`
- `timeline`: the ticket's audit log, oldest first, `[{ id, action, fromStatus, toStatus, actor, meta, createdAt }]`

The stub paths are a starting point. Owners can rename or reshape them, but must update this table in the same PR.
