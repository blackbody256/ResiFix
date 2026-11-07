# ResiFix API contract

> Shared contract: change only by PR to Ann. Add your endpoint here **in the same PR** that implements it.

Base path: `/api`. JSON in and out. Authenticated endpoints need `Authorization: Bearer <jwt>`.

## Conventions

- **Success**: a JSON object whose top-level key names the resource: `{ "ticket": {...} }` or `{ "tickets": [...] }`.
- **Error**: `{ "error": { "code": "NOT_FOUND", "message": "Human readable", "details": <optional> } }`

| Status | code                | When                                                  |
| ------ | ------------------- | ----------------------------------------------------- |
| 400    | `VALIDATION_FAILED` | body failed zod validation (`details` = field errors) |
| 400    | `BAD_REQUEST`       | other client error                                    |
| 401    | `UNAUTHORIZED`      | missing/invalid/expired token, wrong OTP              |
| 403    | `FORBIDDEN`         | wrong role                                            |
| 404    | `NOT_FOUND`         | no such record, **or it belongs to another property** |
| 409    | `CONFLICT`          | illegal status transition, duplicate record           |
| 429    | `TOO_MANY_REQUESTS` | too many OTP attempts                                 |
| 501    | `NOT_IMPLEMENTED`   | stub route, backlog item not built yet                |

- IDs are cuid strings. Timestamps are ISO 8601 UTC.
- Phone numbers are stored in E.164 format (`+256700000010`). The API also accepts `0700 000 010`.
- Every response carries an `x-request-id` header. Include it in bug reports.

## Ticket lifecycle

Defined in `server/src/lib/ticketStatus.js`:

```
REPORTED -> REVIEWED | CLOSED
REVIEWED -> SCHEDULED | ASSIGNED | CLOSED
SCHEDULED -> ASSIGNED | IN_PROGRESS
ASSIGNED -> SCHEDULED | IN_PROGRESS
IN_PROGRESS -> COMPLETED
COMPLETED -> STUDENT_CONFIRMED | REOPENED | CLOSED
STUDENT_CONFIRMED -> CLOSED
CLOSED -> REOPENED
REOPENED -> REVIEWED | SCHEDULED | ASSIGNED
```

## Endpoints

### Implemented

| Method | Path                          | Auth | Request           | Response                                                 |
| ------ | ----------------------------- | ---- | ----------------- | -------------------------------------------------------- |
| GET    | `/health`                     | –    | –                 | `{ status, db, time }` (503 if DB down)                  |
| POST   | `/auth/request-otp`           | –    | `{ phone }`       | `{ phone, expiresInSeconds }`                            |
| POST   | `/auth/verify-otp`            | –    | `{ phone, code }` | `{ token, user: { id, propertyId, phone, name, role } }` |
| GET    | `/auth/me`                    | any  | –                 | `{ user }`                                               |
| GET    | `/properties/mine`            | any  | –                 | `{ property: { ..., blocks: [{ ..., rooms }] } }`        |
| GET    | `/reporting/fault-categories` | any  | –                 | `{ categories: [{ ..., items }] }`                       |
| GET    | `/tickets`                    | any  | –                 | `{ tickets }`. Residents see only their own tickets.     |

### Stubs (return 501 until built)

| Method | Path                                         | Role             | Backlog |
| ------ | -------------------------------------------- | ---------------- | ------- |
| POST   | `/properties/blocks`                         | ADMIN            | PB-003  |
| POST   | `/properties/blocks/:blockId/rooms`          | ADMIN            | PB-003  |
| POST   | `/properties/occupancies`                    | ADMIN            | PB-004  |
| POST   | `/reporting/tickets`                         | RESIDENT         | PB-005  |
| POST   | `/reporting/tickets/:id/photos`              | RESIDENT         | PB-006  |
| GET    | `/reporting/tickets/:id/possible-duplicates` | any              | PB-007  |
| GET    | `/tickets/:id`                               | any              | PB-010  |
| POST   | `/tickets/:id/review`                        | ADMIN            | PB-011  |
| POST   | `/tickets/:id/status`                        | ADMIN, CUSTODIAN | PB-020  |
| GET    | `/custodian/queue`                           | CUSTODIAN, ADMIN | PB-012  |
| POST   | `/custodian/tickets/:id/assign`              | CUSTODIAN, ADMIN | PB-013  |
| POST   | `/custodian/tickets/:id/visits`              | CUSTODIAN, ADMIN | PB-014  |
| POST   | `/custodian/visits/:visitId/missed`          | CUSTODIAN, ADMIN | PB-016  |
| POST   | `/custodian/tickets/:id/repair-proof`        | CUSTODIAN, ADMIN | PB-018  |
| POST   | `/completion/tickets/:id/verify`             | RESIDENT         | PB-019  |
| POST   | `/completion/tickets/:id/rating`             | RESIDENT         | PB-025  |
| GET    | `/completion/notifications`                  | any              | PB-027  |

The stub paths are a starting point. Owners can rename or reshape them, but must update this table in the same PR.
