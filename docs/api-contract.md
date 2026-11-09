# ResiFix API contract

> Shared contract: change only by PR to Ann. Add your endpoint here **in the same PR** that implements it.
> The [shared API contract doc](https://claude.ai/artifact/Xzq6Y8Ays5yDGKPZkLwp5s) mirrors this file and adds proposed shapes and a build status for each endpoint still to be built.

Base path: `/api`. JSON in and out. Every route needs `Authorization: Bearer <jwt>` unless marked **public** below.

## Conventions

- **Success**: a JSON object whose top-level key names the resource: `{ "ticket": {...} }` or `{ "tickets": [...] }`.
- **Error**: `{ "error": { "code": "NOT_FOUND", "message": "Human readable", "details": <optional> } }`

| Status | code                | When                                                                                                                                                                                     |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED` | body or query failed validation, or a field's value is not acceptable (an id from another property, a time in the past); `details` = `{ formErrors, fieldErrors: { field: [message] } }` |
| 400    | `BAD_REQUEST`       | other client error                                                                                                                                                                       |
| 400    | `BAD_JSON`          | body is not valid JSON                                                                                                                                                                   |
| 401    | `UNAUTHORIZED`      | missing/invalid/expired token, wrong OTP                                                                                                                                                 |
| 403    | `FORBIDDEN`         | wrong role                                                                                                                                                                               |
| 404    | `NOT_FOUND`         | no such record, **or it belongs to another property**                                                                                                                                    |
| 409    | `CONFLICT`          | illegal status transition, duplicate record                                                                                                                                              |
| 413    | `PAYLOAD_TOO_LARGE` | upload over the size limit                                                                                                                                                               |
| 429    | `TOO_MANY_REQUESTS` | too many OTP attempts                                                                                                                                                                    |
| 501    | `NOT_IMPLEMENTED`   | stub route, backlog item not built yet                                                                                                                                                   |

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

| Method | Path                                | Auth             | Request                                          | Response                                                                                                                                                                    |
| ------ | ----------------------------------- | ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                           | public           | –                                                | `{ status, db, redis, time }` (503 if DB down)                                                                                                                              |
| POST   | `/auth/request-otp`                 | public           | `{ phone }`                                      | `{ phone, expiresInSeconds }`                                                                                                                                               |
| POST   | `/auth/verify-otp`                  | public           | `{ phone, code }`                                | `{ token, user: { id, propertyId, phone, name, role } }`                                                                                                                    |
| GET    | `/auth/me`                          | any              | –                                                | `{ user }`                                                                                                                                                                  |
| GET    | `/properties/mine`                  | any              | –                                                | `{ property: { ..., blocks: [{ ..., rooms }] } }`                                                                                                                           |
| GET    | `/reporting/fault-categories`       | any              | –                                                | `{ categories: [{ ..., items }] }`                                                                                                                                          |
| POST   | `/reporting/tickets/:id/photos`     | RESIDENT         | multipart, field `photo` (JPEG/PNG/WebP, ≤ 5 MB) | `{ photo: { id, kind, createdAt } }`                                                                                                                                        |
| GET    | `/reporting/photos/:photoId/link`   | any              | –                                                | `{ url, expiresAt }`: presigned link; residents: own tickets                                                                                                                |
| GET    | `/tickets`                          | any              | –                                                | `{ tickets }`, latest 50. Residents see only their own. Each has `room`, `faultItem.category`, `assignee { id, name }` and `nextVisit { id, scheduledAt } \| null` (PB-010) |
| GET    | `/tickets/:id`                      | any              | –                                                | `{ ticket }` with photos, visits, proof, `timeline` (PB-010)                                                                                                                |
| GET    | `/custodian/targets`                | CUSTODIAN, ADMIN | –                                                | `{ targets: [{ id, priority, category, respondWithinH, resolveWithinH }] }` (PB-012)                                                                                        |
| GET    | `/custodian/queue`                  | CUSTODIAN, ADMIN | query, see below                                 | `{ tickets: QueueItem[], summary }` (PB-013)                                                                                                                                |
| POST   | `/custodian/tickets/:id/assign`     | CUSTODIAN, ADMIN | `{ assigneeId }`                                 | `{ ticket: QueueItem }` (PB-013)                                                                                                                                            |
| POST   | `/custodian/tickets/:id/review`     | CUSTODIAN, ADMIN | `{ faultItemId?, priority?, note? }`             | `{ ticket: QueueItem }` (PB-014)                                                                                                                                            |
| POST   | `/custodian/tickets/:id/visits`     | CUSTODIAN, ADMIN | `{ scheduledAt, custodianId?, notes? }`          | 201 `{ visit, ticket: QueueItem }` (PB-015)                                                                                                                                 |
| PATCH  | `/custodian/visits/:visitId`        | CUSTODIAN, ADMIN | `{ scheduledAt, notes? }`                        | `{ visit, ticket: QueueItem }` (PB-016)                                                                                                                                     |
| POST   | `/visits/:visitId/change-request`   | RESIDENT         | `{ message }`                                    | 201 `{ changeRequest: { visitId, message, requestedAt } }` (PB-016)                                                                                                         |
| POST   | `/custodian/visits/:visitId/missed` | CUSTODIAN, ADMIN | `{ reason, notes? }`                             | `{ visit, ticket: QueueItem }` (PB-017)                                                                                                                                     |
| POST   | `/custodian/tickets/:id/start`      | CUSTODIAN, ADMIN | `{ visitId? }` (body optional)                   | `{ visit, ticket: QueueItem }` (PB-018)                                                                                                                                     |
| GET    | `/notifications`                    | any              | –                                                | `{ notifications, unread }`: caller's latest 50, plus the total unread count (PB-023)                                                                                       |
| POST   | `/notifications/:id/read`           | any              | –                                                | `{ notification }`: marks it read (first read time kept); 404 unless it is the caller's (PB-023)                                                                            |
| POST   | `/notifications/read-all`           | any              | –                                                | `{ updated }`: marks all the caller's unread notifications read (PB-023)                                                                                                    |
| GET    | `/notifications/push/public-key`    | public           | –                                                | `{ publicKey }` (null when Web Push is not configured)                                                                                                                      |
| POST   | `/notifications/push/subscriptions` | any              | `PushSubscription.toJSON()`                      | `{ subscribed: true }`                                                                                                                                                      |
| DELETE | `/notifications/push/subscriptions` | any              | `{ endpoint }`                                   | `{ subscribed: false }`                                                                                                                                                     |

### Stubs (return 501 until built)

| Method | Path                                   | Role             | Backlog        |
| ------ | -------------------------------------- | ---------------- | -------------- |
| POST   | `/properties/blocks`                   | ADMIN            | PB-003         |
| POST   | `/properties/blocks/:blockId/rooms`    | ADMIN            | PB-003         |
| POST   | `/properties/occupancies`              | ADMIN            | PB-004         |
| POST   | `/reporting/tickets`                   | RESIDENT         | PB-005, PB-006 |
| POST   | `/completion/tickets/:id/repair-proof` | CUSTODIAN, ADMIN | PB-019         |
| POST   | `/completion/tickets/:id/verify`       | RESIDENT         | PB-020         |
| POST   | `/completion/tickets/:id/rating`       | RESIDENT         | PB-022         |

Backlog IDs and titles match the ClickUp board. Stories with no stub yet add their endpoints to this file in the PR that builds them.

### Response targets and breach flags (PB-012)

Each `ResponseTarget` gives a priority (optionally one category) two windows, both counted from when the ticket was reported, or last reopened:

| Clock     | Runs while the ticket is               | Ends when                                   | Window           |
| --------- | -------------------------------------- | ------------------------------------------- | ---------------- |
| `RESPOND` | `REPORTED`, `REVIEWED`, `REOPENED`     | a custodian assigns, schedules or starts it | `respondWithinH` |
| `RESOLVE` | `ASSIGNED`, `SCHEDULED`, `IN_PROGRESS` | the repair is `COMPLETED`                   | `resolveWithinH` |

A category's own target wins over the property-wide one for the same priority. `Ticket.dueAt` holds the respond-by time; `ResponseTargetsService.startClock(ticketId)` sets it and schedules the `response-deadline` alert, and must be called after a ticket is reported (PB-005), reviewed or reclassified (PB-014) and reopened (PB-020). A ticket is `DUE_SOON` in the last quarter of its window and `OVERDUE` after it.

### Work queue (PB-013)

`GET /custodian/queue` returns the caller property's open tickets (`REPORTED`, `REVIEWED`, `REOPENED`, `ASSIGNED`, `SCHEDULED`, `IN_PROGRESS`), most pressing first: earliest target deadline (so overdue tickets lead), then priority, then oldest report.

| Query        | Example                     | Meaning                                                                   |
| ------------ | --------------------------- | ------------------------------------------------------------------------- |
| `status`     | `SCHEDULED,IN_PROGRESS`     | Any of the open statuses, or `COMPLETED` (waiting for the resident)       |
| `priority`   | `URGENT,HIGH`               |                                                                           |
| `state`      | `OVERDUE` or `DUE_SOON`     | Against the response target                                               |
| `assignee`   | `me`, `unassigned`, user id |                                                                           |
| `categoryId` | id                          |                                                                           |
| `blockId`    | id                          |                                                                           |
| `q`          | `flush`, `102`              | Case-insensitive match on description, room, block, fault, category or id |
| `limit`      | `50`                        | 1 to 200, default 100. `summary` still counts every match.                |

A `QueueItem` names the room, never the resident:

```
{ id, status, priority, description, createdAt, reopenCount,
  room: { id, number, block: { id, name } },
  faultItem: { id, name, category: { id, name } },
  assignee: { id, name } | null,
  photoCount,                                    // the resident's report photos
  nextVisit: { id, scheduledAt, custodian: { id, name },
               changeRequest: { message, requestedAt } | null } | null,
  lastMissedVisit: { id, scheduledAt } | null,   // when the latest visit was missed
  target: { clock, dueAt, respondBy, resolveBy, state, minutesLeft } | null,
  next: 'REVIEW' | 'SCHEDULE' | 'VISIT' | 'RESCHEDULE' | 'COMPLETE' | 'AWAIT_RESIDENT' }
```

`summary` is `{ total, overdue, dueSoon, unassigned }`.

`POST /custodian/tickets/:id/assign { assigneeId }` gives the ticket to an active custodian of the property. `REVIEWED` and `REOPENED` tickets become `ASSIGNED`; assigned, scheduled and in-progress tickets keep their status and their upcoming visits move to the new custodian. A `REPORTED` ticket must be reviewed first (409), and finished tickets cannot be assigned (409). The new assignee is notified unless they assigned it to themselves. Audit action: `ticket.assigned`, `meta: { assigneeId, previousAssigneeId }`.

### Review and correct a ticket (PB-014)

`POST /custodian/tickets/:id/review { faultItemId?, priority?, note? }`

- `REPORTED` or `REOPENED` -> `REVIEWED`. An empty body confirms the report as it is.
- `faultItemId` corrects the fault (an active item of the property's catalogue, else 400). A different item brings its default priority unless `priority` is also sent.
- A ticket that is already `REVIEWED`, `ASSIGNED`, `SCHEDULED` or `IN_PROGRESS` can be reclassified without changing status; a body that changes nothing is a 409, as is any finished ticket.
- The resident's `description` is never changed. `note` (up to 500 characters) records what the custodian found.
- While the ticket still waits for a response, its respond clock restarts for the new category and priority (`startClock`).
- Audit action `ticket.reviewed` (with the status change) or `ticket.reclassified`, `meta: { faultItem?: { from, to }, priority?: { from, to }, note? }`.

### Schedule a repair visit (PB-015)

`POST /custodian/tickets/:id/visits { scheduledAt, custodianId?, notes? }` -> 201 `{ visit: { id, scheduledAt, arrivedAt, missed, notes, custodian }, ticket: QueueItem }`

- `scheduledAt` is ISO 8601 with an offset (`2026-11-10T16:00:00+03:00`), from now to 60 days ahead.
- `REVIEWED`, `ASSIGNED` and `REOPENED` tickets become `SCHEDULED`. A `SCHEDULED` ticket whose visit was missed, or an `IN_PROGRESS` ticket needing a follow-up, gets another visit and keeps its status. `REPORTED` needs a review first; finished tickets cannot get visits (409).
- One upcoming visit per ticket (409 otherwise): move it with PB-016 rather than booking a second.
- The visitor is `custodianId`, else the ticket's assignee, else the caller if a custodian (else 400). An unassigned ticket is assigned to the visitor.
- Notifies the resident with the time in Kampala time ("Tue 10 Nov, 4:00 pm"), and the visitor if someone else booked it. Not yet checked against the resident's availability: that waits for PB-008 to store it.
- Audit action `visit.scheduled`, `meta: { visitId, scheduledAt, custodianId }`.

### Request another time (PB-016)

- `POST /visits/:visitId/change-request { message }` (resident): asks for a different time for the upcoming visit of a ticket they reported, before the visit is due (404 for anyone else's visit; 409 once it has happened or its time has passed). `message` (1 to 300 characters) says why and when suits them. One open request per visit (409). The visiting custodian and the assignee are notified. Audit action `visit.change_requested`, `meta: { visitId, message, scheduledAt }`.
- In the work queue the visit shows `nextVisit.changeRequest: { message, requestedAt }` and the ticket's `next` is `RESCHEDULE`, until the visit is moved.
- `PATCH /custodian/visits/:visitId { scheduledAt, notes? }` (staff): moves an upcoming visit (409 if it already happened), which also answers an open request. The resident is told the new time, and the visiting custodian if someone else moved it. The same time and notes is a no-op. Audit action `visit.rescheduled`, `meta: { visitId, from, to }`.

A request is open while it is the latest `visit.*` audit event for its visit, so no extra table is needed.

### Missed visit (PB-017)

`POST /custodian/visits/:visitId/missed { reason, notes? }`

- `reason`: `RESIDENT_ABSENT` (nobody in to open the room), `NO_ACCESS` (the room or fitting could not be reached), `CUSTODIAN_UNAVAILABLE` (the custodian could not come) or `OTHER` (then `notes` is required). The reason is what the missed-visit figures (PB-028) count.
- Only once the visit time has come (409 before it: move the visit instead), and only once per visit (409).
- The ticket keeps its status (`SCHEDULED`, or `IN_PROGRESS` for a follow-up visit); in the work queue it shows `lastMissedVisit` and `next: 'RESCHEDULE'`. Book the new time with PB-015.
- The resident is told what happened and that the ticket stays open; `notes` are shared with them.
- Audit action `visit.missed`, `meta: { visitId, reason, scheduledAt, notes? }`.

### Mark work in progress (PB-018)

`POST /custodian/tickets/:id/start { visitId? }`: the custodian has arrived and starts the repair.

- Records `arrivedAt` on the upcoming visit (or on `visitId`, which must be an upcoming visit of this ticket). With no visit booked (an `ASSIGNED` ticket, or after a missed visit) it is a walk-in: a visit is created with `scheduledAt = arrivedAt = now`, so every attempt is on record.
- `SCHEDULED` or `ASSIGNED` -> `IN_PROGRESS`. On an `IN_PROGRESS` ticket it records arrival for a booked follow-up visit; with none booked it is a 409. `REPORTED`, `REVIEWED` and `REOPENED` need a review, assignment or booking first, and finished tickets cannot start (409).
- Arrival is what the response target counts as the response. The resident is told work has started.
- Audit action `visit.arrived` (with the status change when there is one), `meta: { visitId, walkIn }`.

### Custodian alerts (PB-024)

`CustodianAlertsService` (exported by `NotificationsModule`) sends in-app, Web Push and SMS-fallback alerts to active staff of the ticket's property:

| Call                       | Who calls it                                              | Who is alerted                                            |
| -------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `ticketReported(ticketId)` | PB-005, right after creating a ticket                     | every custodian of the property (the admins if none)      |
| `ticketBreached(ticketId)` | the `response-deadline` job, when the respond time passes | the assignee (or every custodian if none), and the admins |
| `ticketReopened(ticketId)` | PB-020, right after a resident reopens a ticket           | the assignee (or every custodian if none), and the admins |

PB-005 and PB-020 should also call `ResponseTargetsService.startClock(ticketId)` (exported by `CustodianModule`), which sets `dueAt` and schedules the breach alert.

### Resident updates (PB-023)

`ResidentUpdatesService` (exported by `NotificationsModule`) tells the resident who reported a ticket about updates no other story already sends. Like every notification it goes in-app, then Web Push, then SMS. Nothing is sent when the reporter's account is inactive.

| Call                        | Who calls it                                                      | Message                                                           |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ticketReviewed(ticketId)`  | PB-014, after a first review (`REPORTED`/`REOPENED` → `REVIEWED`) | "Report reviewed": a repair is being arranged                     |
| `ticketAssigned(ticketId)`  | PB-013, after a custodian is assigned or the job changes hands    | "Custodian assigned": names the custodian                         |
| `repairCompleted(ticketId)` | PB-019, after proof of repair (`IN_PROGRESS` → `COMPLETED`)       | "Repair finished": confirm or dispute within the auto-close hours |

Already sent to the resident elsewhere, so not repeated: visit booked, moved or missed, and repair started (custodian `VisitsService`), and the 48-hour auto-close (worker, PB-021).

### `GET /tickets/:id` (PB-010)

Same visibility as the list: residents get **404** for tickets they did not report; staff see any ticket in their property. The `ticket` object has the ticket's own fields plus:

- `room` (with `block`), `faultItem` (with `category`), `reporter { id, name, phone }`, `assignee { id, name, role } | null`
- `photos`: the resident's report photos (`kind: REPORT`), `[{ id, kind, url, urlExpiresAt, createdAt }]`. `url` is a presigned link; fetch the ticket again after `urlExpiresAt`.
- `visits` (with `custodian`), `repairProofs` (with `submittedBy` and their own `photos`), `verifications` (with `user`)
- `rating`: **residents only** (their own ticket). Staff never get an individual rating; managers see rating totals in analytics (Deliverable 4).
- `timeline` (PB-011): the ticket's audit log, oldest first, `[{ id, action, fromStatus, toStatus, actor, createdAt }]`. The raw audit `meta` is never sent.

The stub paths are a starting point. Owners can rename or reshape them, but must update this table in the same PR.
