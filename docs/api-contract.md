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
| 429    | `TOO_MANY_REQUESTS` | too many OTP requests or attempts; `details.retryAfterSeconds` when requests are limited (PB-002)                                                                                        |
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

| Method | Path                                     | Auth             | Request                                             | Response                                                                                                                                                                    |
| ------ | ---------------------------------------- | ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                | public           | –                                                   | `{ status, db, redis, time }` (503 if DB down)                                                                                                                              |
| POST   | `/auth/request-otp`                      | public           | `{ phone }`                                         | `{ phone, expiresInSeconds }`                                                                                                                                               |
| POST   | `/auth/verify-otp`                       | public           | `{ phone, code }`                                   | `{ token, user: { id, propertyId, phone, name, role } }`                                                                                                                    |
| GET    | `/auth/me`                               | any              | –                                                   | `{ user }`                                                                                                                                                                  |
| GET    | `/properties/mine`                       | any              | –                                                   | `{ property: { ..., blocks: [{ ..., rooms }] } }`                                                                                                                           |
| GET    | `/reporting/fault-categories`            | any              | –                                                   | `{ categories: [{ ..., items }] }`                                                                                                                                          |
| GET    | `/properties/facilities`                 | any              | –                                                   | `{ facilities: [{ id, name, location, isActive }] }`                                                                                                                        |
| POST   | `/properties/facilities`                 | ADMIN            | `{ name, location? }`                               | `{ facility }`                                                                                                                                                              |
| PATCH  | `/properties/facilities/:id`             | ADMIN            | `{ name?, location?, isActive? }`                   | `{ facility }`                                                                                                                                                              |
| GET    | `/reporting/availability`                | RESIDENT/ADMIN   | Admin may pass `?userId=` within the property       | `{ windows: [{ id, weekday, startMinute, endMinute }] }`; admin reads are audited                                                                                           |
| PUT    | `/reporting/availability`                | RESIDENT         | `{ windows: [...] }`                                | Replaces the resident's complete weekly set in one transaction                                                                                                              |
| DELETE | `/reporting/availability/:id`            | RESIDENT         | –                                                   | `{ deleted: true }`                                                                                                                                                         |
| GET    | `/reporting/duplicate-candidates`        | RESIDENT         | `faultItemId`, exactly one of `roomId`/`facilityId` | Privacy-safe candidate summaries; candidates match the same physical target and open status                                                                                 |
| POST   | `/reporting/tickets/:canonicalId/follow` | RESIDENT         | –                                                   | Creates a follower ticket and `DuplicateLink` transactionally; repeated follows return the existing link                                                                    |
| POST   | `/reporting/tickets/:id/photos`          | RESIDENT         | multipart, field `photo` (JPEG/PNG/WebP, ≤ 5 MB)    | `{ photo: { id, kind, createdAt } }`                                                                                                                                        |
| GET    | `/reporting/photos/:photoId/link`        | any              | –                                                   | `{ url, expiresAt }`: presigned link; residents: own tickets                                                                                                                |
| GET    | `/tickets`                               | any              | –                                                   | `{ tickets }`, latest 50. Residents see only their own. Each has `room`, `faultItem.category`, `assignee { id, name }` and `nextVisit { id, scheduledAt } \| null` (PB-010) |
| GET    | `/tickets/:id`                           | any              | –                                                   | `{ ticket }` with photos, visits, proof, `timeline` (PB-010)                                                                                                                |
| GET    | `/custodian/targets`                     | CUSTODIAN, ADMIN | –                                                   | `{ targets: [{ id, priority, category, respondWithinH, resolveWithinH }] }` (PB-012)                                                                                        |
| GET    | `/custodian/staff`                       | CUSTODIAN, ADMIN | –                                                   | `{ staff: [{ id, name }] }`: active custodians of the property, for the assign and visit pickers (PB-013)                                                                   |
| GET    | `/custodian/queue`                       | CUSTODIAN, ADMIN | query, see below                                    | `{ tickets: QueueItem[], summary }` (PB-013)                                                                                                                                |
| POST   | `/custodian/tickets/:id/assign`          | CUSTODIAN, ADMIN | `{ assigneeId }`                                    | `{ ticket: QueueItem }` (PB-013)                                                                                                                                            |
| POST   | `/custodian/tickets/:id/review`          | CUSTODIAN, ADMIN | `{ faultItemId?, priority?, note? }`                | `{ ticket: QueueItem }` (PB-014)                                                                                                                                            |
| POST   | `/custodian/tickets/:id/visits`          | CUSTODIAN, ADMIN | `{ scheduledAt, custodianId?, notes? }`             | 201 `{ visit, ticket: QueueItem }` (PB-015)                                                                                                                                 |
| PATCH  | `/custodian/visits/:visitId`             | CUSTODIAN, ADMIN | `{ scheduledAt, notes? }`                           | `{ visit, ticket: QueueItem }` (PB-016)                                                                                                                                     |
| POST   | `/visits/:visitId/change-request`        | RESIDENT         | `{ message }`                                       | 201 `{ changeRequest: { visitId, message, requestedAt } }` (PB-016)                                                                                                         |
| POST   | `/custodian/visits/:visitId/missed`      | CUSTODIAN, ADMIN | `{ reason, notes? }`                                | `{ visit, ticket: QueueItem }` (PB-017)                                                                                                                                     |
| POST   | `/custodian/tickets/:id/start`           | CUSTODIAN, ADMIN | `{ visitId? }` (body optional)                      | `{ visit, ticket: QueueItem }` (PB-018)                                                                                                                                     |
| GET    | `/notifications`                         | any              | –                                                   | `{ notifications, unread }`: caller's latest 50, plus the total unread count (PB-023)                                                                                       |
| POST   | `/notifications/:id/read`                | any              | –                                                   | `{ notification }`: marks it read (first read time kept); 404 unless it is the caller's (PB-023)                                                                            |
| POST   | `/notifications/read-all`                | any              | –                                                   | `{ updated }`: marks all the caller's unread notifications read (PB-023)                                                                                                    |
| GET    | `/notifications/push/public-key`         | public           | –                                                   | `{ publicKey }` (null when Web Push is not configured)                                                                                                                      |
| POST   | `/notifications/push/subscriptions`      | any              | `PushSubscription.toJSON()`                         | `{ subscribed: true }`                                                                                                                                                      |
| DELETE | `/notifications/push/subscriptions`      | any              | `{ endpoint }`                                      | `{ subscribed: false }`                                                                                                                                                     |

### Additional property administration endpoints

| Method | Path                                             | Auth             | Request                                                                             | Response                                                                                                                                                                                 |
| ------ | ------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                        | public           | –                                                                                   | `{ status, db, redis, time }` (503 if DB down)                                                                                                                                           |
| POST   | `/auth/request-otp`                              | public           | `{ phone }`                                                                         | `{ phone, expiresInSeconds }`                                                                                                                                                            |
| POST   | `/auth/verify-otp`                               | public           | `{ phone, code }`                                                                   | `{ token, user: { id, propertyId, phone, name, role } }`                                                                                                                                 |
| GET    | `/auth/me`                                       | any              | –                                                                                   | `{ user }`                                                                                                                                                                               |
| GET    | `/properties/mine`                               | any              | –                                                                                   | `{ property: { ..., blocks: [{ ..., rooms }] } }`                                                                                                                                        |
| GET    | `/properties/catalogue`                          | ADMIN            | –                                                                                   | `{ categories: [{ ..., items }], responseTargets: [{ ..., category: { id, name } \| null }] }`, inactive items included (PB-029)                                                         |
| POST   | `/properties/fault-categories`                   | ADMIN            | `{ name }` (1 to 100)                                                               | 201 `{ category }`; 409 if the name exists in the property (PB-029)                                                                                                                      |
| PATCH  | `/properties/fault-categories/:id`               | ADMIN            | `{ name }` (1 to 100)                                                               | `{ category }`; 404, 409 if another category has the name (PB-029)                                                                                                                       |
| DELETE | `/properties/fault-categories/:id`               | ADMIN            | –                                                                                   | `{ deleted: true, id }`; 404, 409 while it has any fault items (PB-029)                                                                                                                  |
| POST   | `/properties/fault-categories/:categoryId/items` | ADMIN            | `{ name, defaultPriority }`                                                         | 201 `{ item }`; 404 if the category is not in the property, 409 if the name exists in the category (PB-029)                                                                              |
| PATCH  | `/properties/fault-items/:id`                    | ADMIN            | `{ name?, defaultPriority?, isActive? }`, at least one                              | `{ item }`; 404, 409 on a duplicate name (PB-029)                                                                                                                                        |
| POST   | `/properties/response-targets`                   | ADMIN            | `{ categoryId?, priority, respondWithinH, resolveWithinH }`                         | 201 `{ responseTarget }`; 404 unknown category, 409 duplicate (PB-029)                                                                                                                   |
| PATCH  | `/properties/response-targets/:id`               | ADMIN            | same body as POST, all required except `categoryId`                                 | `{ responseTarget }`; 404, 409 duplicate; see below (PB-029)                                                                                                                             |
| POST   | `/properties/blocks`                             | ADMIN            | `{ name }`                                                                          | 201 `{ block }`; 409 if the property already has a block with that name (PB-003)                                                                                                         |
| POST   | `/properties/blocks/:blockId/rooms`              | ADMIN            | `{ number, capacity? }` (capacity 1 to 100, default 1)                              | 201 `{ room }`; 404 if the block is not in the property, 409 if the number exists in the block (PB-003)                                                                                  |
| POST   | `/properties/occupancies`                        | ADMIN            | `{ userId, roomId }`                                                                | 201 `{ occupancy }`; 404 if the resident or room is not in the property, 409 if the resident already has a room or the room is full (PB-004)                                             |
| GET    | `/reporting/fault-categories`                    | any              | –                                                                                   | `{ categories: [{ ..., items }] }`                                                                                                                                                       |
| POST   | `/reporting/tickets`                             | RESIDENT         | `{ roomId, faultItemId, description? }` (description ≤ 2000 characters)             | 201 `{ ticket }` with `room.block` and `faultItem`; priority from the fault item. 404 unless `roomId` is the caller's current room, or if the fault item is not in the property (PB-005) |
| POST   | `/reporting/tickets/:id/photos`                  | RESIDENT         | multipart, field `photo` (JPEG/PNG/WebP, ≤ 5 MB)                                    | `{ photo: { id, kind, createdAt } }`                                                                                                                                                     |
| GET    | `/reporting/photos/:photoId/link`                | any              | –                                                                                   | `{ url, expiresAt }`: presigned link; residents: own tickets                                                                                                                             |
| GET    | `/tickets`                                       | any              | –                                                                                   | `{ tickets }`, latest 50. Residents see only their own. Each has `room`, `faultItem.category`, `assignee { id, name }` and `nextVisit { id, scheduledAt } \| null` (PB-010)              |
| GET    | `/tickets/:id`                                   | any              | –                                                                                   | `{ ticket }` with photos, visits, proof, `timeline` (PB-010)                                                                                                                             |
| POST   | `/completion/tickets/:id/rating`                 | RESIDENT         | `{ score: 1..5, comment? }` (comment ≤ 500)                                         | 201 `{ rating: { score, comment, createdAt } }` (PB-022)                                                                                                                                 |
| GET    | `/custodian/targets`                             | CUSTODIAN, ADMIN | –                                                                                   | `{ targets: [{ id, priority, category, respondWithinH, resolveWithinH }] }` (PB-012)                                                                                                     |
| GET    | `/custodian/staff`                               | CUSTODIAN, ADMIN | –                                                                                   | `{ staff: [{ id, name }] }`: active custodians of the property, for the assign and visit pickers (PB-013)                                                                                |
| GET    | `/custodian/queue`                               | CUSTODIAN, ADMIN | query, see below                                                                    | `{ tickets: QueueItem[], summary }` (PB-013)                                                                                                                                             |
| POST   | `/custodian/tickets/:id/assign`                  | CUSTODIAN, ADMIN | `{ assigneeId }`                                                                    | `{ ticket: QueueItem }` (PB-013)                                                                                                                                                         |
| POST   | `/custodian/tickets/:id/review`                  | CUSTODIAN, ADMIN | `{ faultItemId?, priority?, note? }`                                                | `{ ticket: QueueItem }` (PB-014)                                                                                                                                                         |
| POST   | `/custodian/tickets/:id/visits`                  | CUSTODIAN, ADMIN | `{ scheduledAt, custodianId?, notes? }`                                             | 201 `{ visit, ticket: QueueItem }` (PB-015)                                                                                                                                              |
| PATCH  | `/custodian/visits/:visitId`                     | CUSTODIAN, ADMIN | `{ scheduledAt, notes? }`                                                           | `{ visit, ticket: QueueItem }` (PB-016)                                                                                                                                                  |
| POST   | `/visits/:visitId/change-request`                | RESIDENT         | `{ message }`                                                                       | 201 `{ changeRequest: { visitId, message, requestedAt } }` (PB-016)                                                                                                                      |
| POST   | `/custodian/visits/:visitId/missed`              | CUSTODIAN, ADMIN | `{ reason, notes? }`                                                                | `{ visit, ticket: QueueItem }` (PB-017)                                                                                                                                                  |
| POST   | `/custodian/tickets/:id/start`                   | CUSTODIAN, ADMIN | `{ visitId? }` (body optional)                                                      | `{ visit, ticket: QueueItem }` (PB-018)                                                                                                                                                  |
| POST   | `/completion/tickets/:id/repair-proof`           | CUSTODIAN, ADMIN | multipart, field `photo` (JPEG/PNG/WebP, ≤ 5 MB) and `notes` (1 to 1000 characters) | 201 `{ proof: { ..., photos: [{ id, kind, createdAt }] } }`; `IN_PROGRESS` → `COMPLETED`, 409 from any other status; a custodian only on tickets assigned to them, else 403 (PB-019)     |
| GET    | `/completion/stats`                              | ADMIN            | query `from?`, `to?`, see below                                                     | `{ range, totals, response, repair, byPriority, daily }` (PB-026)                                                                                                                        |
| GET    | `/completion/recurring-faults`                   | ADMIN            | query `from?`, `to?`, as for stats                                                  | `{ range, totalReports, byCategory, byItem, byBlock, byRoom, byRoomFault }` (PB-027)                                                                                                     |
| GET    | `/notifications`                                 | any              | –                                                                                   | `{ notifications, unread }`: caller's latest 50, plus the total unread count (PB-023)                                                                                                    |
| POST   | `/notifications/:id/read`                        | any              | –                                                                                   | `{ notification }`: marks it read (first read time kept); 404 unless it is the caller's (PB-023)                                                                                         |
| POST   | `/notifications/read-all`                        | any              | –                                                                                   | `{ updated }`: marks all the caller's unread notifications read (PB-023)                                                                                                                 |
| GET    | `/notifications/push/public-key`                 | public           | –                                                                                   | `{ publicKey }` (null when Web Push is not configured)                                                                                                                                   |
| POST   | `/notifications/push/subscriptions`              | any              | `PushSubscription.toJSON()`                                                         | `{ subscribed: true }`                                                                                                                                                                   |
| DELETE | `/notifications/push/subscriptions`              | any              | `{ endpoint }`                                                                      | `{ subscribed: false }`                                                                                                                                                                  |

### Stubs (return 501 until built)

| Method | Path                             | Role     | Backlog |
| ------ | -------------------------------- | -------- | ------- |
| POST   | `/completion/tickets/:id/verify` | RESIDENT | PB-020  |

Backlog IDs and titles match the ClickUp board. Stories with no stub yet add their endpoints to this file in the PR that builds them.

### Code request limits (PB-002)

`POST /auth/request-otp` is limited per phone number and per client IP, so nobody can run up SMS costs or try numbers to find which are registered.

| Setting                      | Default | Meaning                                       |
| ---------------------------- | ------- | --------------------------------------------- |
| `OTP_REQUESTS_PER_PHONE`     | 5       | Requests for one number in each window        |
| `OTP_REQUESTS_PER_IP`        | 30      | Requests from one client IP in each window    |
| `OTP_REQUEST_WINDOW_SECONDS` | 900     | Window length; it starts at the first request |

- Over either limit: **429** `TOO_MANY_REQUESTS` with `details: { retryAfterSeconds }`, and no code is created or sent.
- Every request that passes validation counts, including ones for unregistered numbers (404). A body that fails validation (400) does not.
- The IP is checked first; a request blocked by its IP does not count against the phone.
- The client IP is the one Nginx forwards (`trust proxy` is 1). Keep the IP limit generous: a hostel's residents often share one Wi-Fi address.
- Fixed windows in Redis (`resifix:otp-limit:*`). If Redis is unreachable the limit is skipped and an error is logged, so logins keep working.
- Wrong codes are limited separately, per code: `OTP_MAX_ATTEMPTS` (default 5), then **429** until a new code is requested.

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

PB-005 and PB-020 also call `ResponseTargetsService.startClock(ticketId)` (exported by `CustodianModule`), which sets `dueAt` and schedules the breach alert. `POST /reporting/tickets` does both (clock first, so the alert says when to respond by) and returns the ticket with its `dueAt`. A failure in either is logged, not returned: the ticket is already saved and an error would make the resident report it twice. PB-020 still has to make these calls when it reopens a ticket.

### Resident updates (PB-023)

`ResidentUpdatesService` (exported by `NotificationsModule`) tells the resident who reported a ticket about updates no other story already sends. Like every notification it goes in-app, then Web Push, then SMS. Nothing is sent when the reporter's account is inactive.

| Call                        | Who calls it                                                      | Message                                                           |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ticketReviewed(ticketId)`  | PB-014, after a first review (`REPORTED`/`REOPENED` → `REVIEWED`) | "Report reviewed": a repair is being arranged                     |
| `ticketAssigned(ticketId)`  | PB-013, after a custodian is assigned or the job changes hands    | "Custodian assigned": names the custodian                         |
| `repairCompleted(ticketId)` | PB-019, after proof of repair (`IN_PROGRESS` → `COMPLETED`)       | "Repair finished": confirm or dispute within the auto-close hours |

Already sent to the resident elsewhere, so not repeated: visit booked, moved or missed, and repair started (custodian `VisitsService`), and the 48-hour auto-close (worker, PB-021).

### Rate the service (PB-022)

`POST /completion/tickets/:id/rating { score, comment? }`: the resident who reported the ticket rates the repair, once.

- Only the reporter, in their own property: **404** for anyone else's ticket. Staff get **403**.
- Only when the repair is done: `COMPLETED`, `STUDENT_CONFIRMED` or `CLOSED`, otherwise **409**. `COMPLETED` is allowed so the resident can rate in the same step as confirming (PB-020).
- One rating per ticket: a second one is **409**.
- `score` is a whole number from 1 to 5; `comment` is trimmed, at most 500 characters.
- Audit action `ticket.rated`, without the score. Individual ratings only ever go back to the resident (in `GET /tickets/:id`); managers see totals in analytics (PB-028, Deliverable 4).

### Response and repair stats (PB-026)

`GET /completion/stats`: response and repair times for the caller's property, for the admin analytics screen. The property is the signed-in admin's; there is no property parameter. Custodians and residents get 403.

| Query  | Example                     | Meaning                                                                              |
| ------ | --------------------------- | ------------------------------------------------------------------------------------ |
| `from` | `2026-11-01T00:00:00+03:00` | Optional. ISO 8601 date-time with `Z` or an offset. Tickets reported at or after it. |
| `to`   | `2026-11-08T00:00:00+03:00` | Optional. Same format. Tickets reported before it (exclusive).                       |

With neither, every ticket of the property is counted. A plain date such as `2026-11-01` is a 400 `VALIDATION_FAILED`; `from` not before `to` is a 400 `BAD_REQUEST`.

- The range selects tickets by when they were reported. Their response and repair count even when they happened after `to`.
- Both clocks start at the report, or at the last reopen. Response ends at the first custodian arrival (`visit.arrivedAt`) and repair at the first completion (audit `ticket.repair_completed`, or else the first repair proof); each counts only when it falls after the clock start. Only the first arrival and first completion are looked at, so a reopened ticket whose first visit came before the reopen shows no response or repair time for its second round.
- `withinTarget` compares against the ticket's response target (`respondWithinH`, `resolveWithinH`). A ticket with no matching target counts as within target.

Response:

- `range { from, to }`: ISO strings, or `null` when not given
- `totals { reported, responded, completed }`: ticket counts
- `response`, `repair`: `{ sampleSize, averageMinutes, medianMinutes, withinTarget, overdue }`. Minutes are whole numbers; averages and medians are `null` with no data.
- `byPriority`: always four entries, `URGENT`, `HIGH`, `MEDIUM`, `LOW`, each `{ priority, reported, responded, completed, averageResponseMinutes, averageRepairMinutes }`
- `daily`: one entry per day with reports, oldest first, `{ date, reported, responded, completed, averageResponseMinutes, averageRepairMinutes }`. `date` is `YYYY-MM-DD` in UTC, not Kampala time.

### Recurring faults (PB-027)

`GET /completion/recurring-faults`: how often each fault is reported, for the admin analytics screen. Same caller rules, `from` and `to` query and 400s as `GET /completion/stats`: tickets are selected by when they were reported, and every status counts.

Response:

- `range { from, to }`: ISO strings, or `null` when not given
- `totalReports`: tickets in the range
- `byCategory`, `byItem`, `byBlock`, `byRoom`: `[{ id, name, group, reports, lastReportedAt }]`. `group` is the category name for items, the block name for rooms, and `null` for categories and blocks. For rooms, `name` is the room number.
- `byRoomFault`: one entry per room and fault item, `[{ id, room, block, faultItem, category, reports, lastReportedAt }]`; `id` is `<roomId>:<faultItemId>`.
- Every list is sorted by `reports`, most first, then by the latest report. Lists are not cut off and include entries with a single report; the client decides what counts as recurring.

### Fault catalogue and response targets (PB-029)

Admin-only management of the property's fault categories, fault items and response targets. Everything is scoped to the caller's property: an id from another property is a **404**. These routes write no audit entries.

- `GET /properties/catalogue` returns every category (by name) with all its items (by name), active or not, and every response target (by priority, then category), each with `category { id, name }`, or `null` for a property-wide target.
- Names are trimmed, 1 to 100 characters, and unique within the property (categories) or within the category (items); the comparison is case-sensitive.
- `DELETE /properties/fault-categories/:id` is a **409** while the category has any fault items, active or not. Deactivate items with `PATCH /properties/fault-items/:id { isActive: false }` to drop them from the resident's list (`GET /reporting/fault-categories`) while keeping their ticket history; there is no route to delete an item. Quirk: `POST /reporting/tickets` does not check `isActive`, so a client that still holds an inactive item's id can report against it.
- `defaultPriority` is `URGENT`, `HIGH`, `MEDIUM` or `LOW`. Changing it affects new reports only.
- Response targets: `categoryId` `null` or left out means property-wide for that priority. `respondWithinH` and `resolveWithinH` are whole hours, 1 to 8760; the code does not require respond to be shorter than resolve. One target per category and priority (**409**).
- `PATCH /properties/response-targets/:id` needs the full body (`priority`, `respondWithinH`, `resolveWithinH`). Quirk: leaving out `categoryId` keeps the target's current category, but the duplicate check is then made against the property-wide target for that priority. Send `categoryId` explicitly (an id, or `null`) when updating.
- Changing a target does not move `dueAt` on open tickets; it applies from the next time a clock starts (`startClock`).

### `GET /tickets/:id` (PB-010)

Same visibility as the list: residents get **404** for tickets they did not report; staff see any ticket in their property. The `ticket` object has the ticket's own fields plus:

- `room` (with `block`), `faultItem` (with `category`), `reporter { id, name, phone }`, `assignee { id, name, role } | null`
- `photos`: the resident's report photos (`kind: REPORT`), `[{ id, kind, url, urlExpiresAt, createdAt }]`. `url` is a presigned link; fetch the ticket again after `urlExpiresAt`.
- `visits` (with `custodian`), `repairProofs` (with `submittedBy` and their own `photos`), `verifications` (with `user`)
- `rating`: **residents only** (their own ticket). Staff never get an individual rating; managers see rating totals in analytics (Deliverable 4).
- `timeline` (PB-011): the ticket's audit log, oldest first, `[{ id, action, fromStatus, toStatus, actor, createdAt }]`. The raw audit `meta` is never sent.

The stub paths are a starting point. Owners can rename or reshape them, but must update this table in the same PR.
