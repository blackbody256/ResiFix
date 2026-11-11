# Amabe reporting follow-up proposal

This proposal is for Ann and the product owner. It does not change `prisma/schema.prisma` or `docs/api-contract.md`.

## PB-006: shared-facility faults

Add a `Facility` model scoped to a property:

```text
Facility
- id
- propertyId
- name
- location (optional)
- isActive
- createdAt
- updatedAt
```

A ticket targets exactly one of `roomId` or `facilityId`. `roomId` becomes optional and `facilityId` becomes optional, with application validation requiring exactly one. Residents can report active facilities in their property. Admins manage facilities.

Proposed endpoints:

```text
GET  /properties/facilities
POST /properties/facilities                 ADMIN
POST /reporting/tickets                     RESIDENT
```

The ticket request accepts either `roomId` or `facilityId`.

## PB-008: weekly resident availability

Add a recurring availability model:

```text
AvailabilityWindow
- id
- userId
- weekday           0..6, Monday = 0
- startMinute      0..1439
- endMinute        1..1440
- createdAt
- updatedAt
```

Rules:

- `endMinute` must be greater than `startMinute`.
- A resident may have multiple non-overlapping windows per weekday.
- Windows are scoped through the resident's property.
- Scheduling checks the requested visit's Kampala-local weekday and time against the resident's windows.

Proposed endpoints:

```text
GET    /reporting/availability
PUT    /reporting/availability
DELETE /reporting/availability/:id
```

The resident owns their availability. Admins may read it for support; custodians consume it through scheduling.
An empty set means no scheduling restriction. A scheduled visit only needs its start time to fall
inside one window because visit duration is not currently modeled. Overnight availability must be
split at midnight. Urgent tickets do not bypass the availability hard block. Admin reads are
property-scoped and audited; custodians only receive the scheduling result.

## PB-009: follow an existing canonical ticket

Use the existing `DuplicateLink` model only after creating a follower ticket, because the model requires both `ticketId` and `canonicalId`.

Proposed flow:

```text
GET  /reporting/duplicate-candidates?faultItemId=...&roomId=...|facilityId=...
POST /reporting/tickets/:canonicalId/follow
```

Candidate matching:

- same property
- same active fault item
- open ticket status
- recent report window, proposed 30 days
- exclude the caller's own ticket

Following creates a minimal follower ticket for the resident's assigned room, links it to the selected canonical ticket, and prevents duplicate repair work. The follower remains visible to the resident and points to the canonical ticket for lifecycle updates.

The follow endpoint must reject:

- a canonical ticket from another property
- a closed ticket
- a ticket that is already following another canonical ticket
- a resident without an active room occupancy

## Approval needed

Ann should approve:

1. The schema migration and `Ticket.roomId`/`Ticket.facilityId` change.
2. The endpoint names and response shapes in the shared API contract.
3. Whether a 30-day duplicate candidate window is acceptable.
4. Whether availability uses Monday-based weekday numbering.

After approval, implementation order is PB-006 schema and API, PB-008 availability and scheduling integration, then PB-009 candidate and follow flow.
