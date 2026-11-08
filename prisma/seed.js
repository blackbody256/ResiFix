// Demo data for local development and demos. Safe to re-run: it wipes and recreates everything.
// Run with `npm run seed` (also runs automatically after `npm run db:reset`).
//
// Two properties, so data isolation can be seen in the app:
//   Kikoni Demo Hostel    Block A / Block B   tickets in every status of the lifecycle
//   Mitchell Hall (demo)  Wing 1 / Wing 2     a different room-naming scheme, a few tickets
// Ticket times are relative to "now", so the urgent ticket is always overdue, tomorrow's visit
// is always tomorrow, and so on. All logins use the dev OTP 123456.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

const HOUR = 60 * 60 * 1000;
const NOW = Date.now();
const hoursAgo = (h) => new Date(NOW - h * HOUR);

/** `hour`:00 Kampala time (UTC+3 all year), `days` from today. */
function kampala(days, hour) {
  const local = new Date(NOW + 3 * HOUR);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour - 3),
  );
}

const FAULTS = {
  Plumbing: [
    ['Leaking tap', 'MEDIUM'],
    ['Blocked toilet', 'HIGH'],
    ['No water', 'URGENT'],
  ],
  Electrical: [
    ['No power in room', 'URGENT'],
    ['Broken socket', 'HIGH'],
    ['Bulb not working', 'LOW'],
  ],
  Carpentry: [
    ['Broken door lock', 'HIGH'],
    ['Broken bed', 'MEDIUM'],
    ['Window will not close', 'MEDIUM'],
  ],
};

// [priority, respondWithinH, resolveWithinH]: property-wide defaults (categoryId = null)
const TARGETS = [
  ['URGENT', 2, 24],
  ['HIGH', 12, 48],
  ['MEDIUM', 24, 72],
  ['LOW', 48, 168],
];

// Each ticket's status history: the path through the lifecycle (server/src/common/ticket-status.ts)
// and who takes each step ('custodian', 'resident' or null for the system).
const PATHS = {
  REPORTED: [],
  REVIEWED: [['REVIEWED', 'custodian']],
  ASSIGNED: [
    ['REVIEWED', 'custodian'],
    ['ASSIGNED', 'custodian'],
  ],
  SCHEDULED: [
    ['REVIEWED', 'custodian'],
    ['SCHEDULED', 'custodian'],
  ],
  IN_PROGRESS: [
    ['REVIEWED', 'custodian'],
    ['SCHEDULED', 'custodian'],
    ['IN_PROGRESS', 'custodian'],
  ],
  COMPLETED: [
    ['REVIEWED', 'custodian'],
    ['SCHEDULED', 'custodian'],
    ['IN_PROGRESS', 'custodian'],
    ['COMPLETED', 'custodian'],
  ],
  CLOSED: [
    ['REVIEWED', 'custodian'],
    ['SCHEDULED', 'custodian'],
    ['IN_PROGRESS', 'custodian'],
    ['COMPLETED', 'custodian'],
    ['STUDENT_CONFIRMED', 'resident'],
    ['CLOSED', null],
  ],
  REOPENED: [
    ['REVIEWED', 'custodian'],
    ['SCHEDULED', 'custodian'],
    ['IN_PROGRESS', 'custodian'],
    ['COMPLETED', 'custodian'],
    ['REOPENED', 'resident'],
  ],
};

const PROPERTIES = [
  {
    name: 'Kikoni Demo Hostel',
    address: 'Kikoni, near Makerere University, Kampala',
    blocks: { 'Block A': ['101', '102', '103', '104'], 'Block B': ['201', '202', '203', '204'] },
    users: [
      { key: 'grace', phone: '+256700000001', name: 'Grace Custodian', role: 'CUSTODIAN' },
      { key: 'moses', phone: '+256700000002', name: 'Moses Admin', role: 'ADMIN' },
      { key: 'joseph', phone: '+256700000003', name: 'Joseph Custodian', role: 'CUSTODIAN' },
      {
        key: 'aisha',
        phone: '+256700000010',
        name: 'Aisha Resident',
        role: 'RESIDENT',
        room: 'Block A-101',
      },
      {
        key: 'brian',
        phone: '+256700000011',
        name: 'Brian Resident',
        role: 'RESIDENT',
        room: 'Block A-102',
      },
      {
        key: 'clare',
        phone: '+256700000012',
        name: 'Clare Resident',
        role: 'RESIDENT',
        room: 'Block B-201',
      },
      {
        key: 'david',
        phone: '+256700000013',
        name: 'David Resident',
        role: 'RESIDENT',
        room: 'Block B-201',
      },
    ],
    // One ticket per lifecycle stage. `reportedH` = hours since the report.
    tickets: [
      {
        reporter: 'aisha',
        item: 'No power in room',
        status: 'REPORTED',
        reportedH: 3, // URGENT target is 2 h: overdue and not yet reviewed
        description: 'Sockets and lights went off after the storm last night.',
      },
      {
        reporter: 'brian',
        item: 'Blocked toilet',
        status: 'REVIEWED',
        reportedH: 5,
        description: 'Toilet in the room will not flush.',
      },
      {
        reporter: 'clare',
        item: 'Broken socket',
        status: 'ASSIGNED',
        reportedH: 20,
        assignee: 'joseph',
        description: 'Socket by the desk is loose and sparks when used.',
      },
      {
        reporter: 'david',
        item: 'Window will not close',
        status: 'SCHEDULED',
        reportedH: 26,
        visits: [{ at: kampala(1, 16), notes: 'Resident available after 4 pm' }],
        description: 'Window latch is broken, rain gets in.',
      },
      {
        reporter: 'aisha',
        item: 'Leaking tap',
        status: 'SCHEDULED',
        reportedH: 50, // the visit was missed: needs a new time
        visits: [{ at: kampala(-1, 10), missed: true, notes: 'No one in the room at 10 am' }],
        description: 'Bathroom tap drips all night.',
      },
      {
        reporter: 'brian',
        item: 'Bulb not working',
        status: 'IN_PROGRESS',
        reportedH: 30,
        visits: [{ at: hoursAgo(1.5), arrivedH: 1 }],
        description: 'Ceiling bulb blew.',
      },
      {
        reporter: 'clare',
        item: 'Broken door lock',
        status: 'COMPLETED',
        reportedH: 40,
        visits: [{ at: hoursAgo(8), arrivedH: 7.5 }],
        proof: 'Replaced the lock cylinder; two keys handed to the resident.',
        description: 'Door does not lock from outside.',
      },
      {
        reporter: 'david',
        item: 'Broken bed',
        status: 'CLOSED',
        reportedH: 120,
        visits: [{ at: hoursAgo(80), arrivedH: 79.5 }],
        proof: 'Replaced two slats and tightened the frame.',
        rating: { score: 4, comment: 'Fixed well, took a few days.' },
        description: 'Bed slats broken.',
      },
      {
        reporter: 'aisha',
        item: 'No water',
        status: 'REOPENED',
        reportedH: 72,
        visits: [{ at: hoursAgo(40), arrivedH: 39.5 }],
        proof: 'Opened the valve on the floor supply.',
        dispute: 'Water came back for one day, now nothing again.',
        description: 'No water from any tap in the room.',
      },
    ],
  },
  {
    name: 'Mitchell Hall (demo)',
    address: 'Makerere University main campus, Kampala',
    blocks: { 'Wing 1': ['12', '14'], 'Wing 2': ['21', '23'] },
    users: [
      { key: 'peter', phone: '+256700000101', name: 'Peter Custodian', role: 'CUSTODIAN' },
      { key: 'ruth', phone: '+256700000102', name: 'Ruth Admin', role: 'ADMIN' },
      {
        key: 'esther',
        phone: '+256700000110',
        name: 'Esther Resident',
        role: 'RESIDENT',
        room: 'Wing 1-12',
      },
      {
        key: 'frank',
        phone: '+256700000111',
        name: 'Frank Resident',
        role: 'RESIDENT',
        room: 'Wing 2-21',
      },
    ],
    tickets: [
      {
        reporter: 'esther',
        item: 'Broken socket',
        status: 'REPORTED',
        reportedH: 2,
        description: 'Socket cover cracked.',
      },
      {
        reporter: 'frank',
        item: 'Leaking tap',
        status: 'SCHEDULED',
        reportedH: 18,
        visits: [{ at: kampala(2, 9) }],
        description: 'Shower tap leaks.',
      },
    ],
  },
];

async function wipe() {
  // Children first. Keep in sync with schema.prisma when models are added.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.rating.deleteMany(),
    prisma.verification.deleteMany(),
    prisma.photo.deleteMany(),
    prisma.repairProof.deleteMany(),
    prisma.visit.deleteMany(),
    prisma.duplicateLink.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.responseTarget.deleteMany(),
    prisma.faultItem.deleteMany(),
    prisma.faultCategory.deleteMany(),
    prisma.occupancy.deleteMany(),
    prisma.otpChallenge.deleteMany(),
    prisma.user.deleteMany(),
    prisma.room.deleteMany(),
    prisma.block.deleteMany(),
    prisma.property.deleteMany(),
  ]);
}

async function seedProperty(spec) {
  const property = await prisma.property.create({
    data: { name: spec.name, address: spec.address },
  });

  const rooms = {}; // "Block A-101" -> room
  for (const [blockName, numbers] of Object.entries(spec.blocks)) {
    const block = await prisma.block.create({ data: { propertyId: property.id, name: blockName } });
    for (const number of numbers) {
      rooms[`${blockName}-${number}`] = await prisma.room.create({
        data: { blockId: block.id, number, capacity: 2 },
      });
    }
  }

  const users = {}; // key -> user
  for (const u of spec.users) {
    users[u.key] = await prisma.user.create({
      data: { propertyId: property.id, phone: u.phone, name: u.name, role: u.role },
    });
    if (u.room) {
      await prisma.occupancy.create({
        data: { userId: users[u.key].id, roomId: rooms[u.room].id },
      });
    }
  }
  const occupantRoom = Object.fromEntries(spec.users.map((u) => [u.key, u.room]));

  const items = {}; // item name -> fault item
  for (const [categoryName, entries] of Object.entries(FAULTS)) {
    const category = await prisma.faultCategory.create({
      data: {
        propertyId: property.id,
        name: categoryName,
        items: { create: entries.map(([name, defaultPriority]) => ({ name, defaultPriority })) },
      },
      include: { items: true },
    });
    for (const item of category.items) items[item.name] = item;
  }

  await prisma.responseTarget.createMany({
    data: TARGETS.map(([priority, respondWithinH, resolveWithinH]) => ({
      propertyId: property.id,
      priority,
      respondWithinH,
      resolveWithinH,
    })),
  });
  const respondWithinH = Object.fromEntries(TARGETS.map(([p, respond]) => [p, respond]));

  const custodian = Object.values(users).find((u) => u.role === 'CUSTODIAN');
  for (const t of spec.tickets) {
    await seedTicket({ property, rooms, users, items, occupantRoom, custodian, respondWithinH }, t);
  }

  return { property, rooms, users: spec.users, tickets: spec.tickets.length };
}

async function seedTicket(ctx, t) {
  const { property, rooms, users, items, occupantRoom, custodian, respondWithinH } = ctx;
  const reporter = users[t.reporter];
  const item = items[t.item];
  const createdAt = hoursAgo(t.reportedH);
  const path = PATHS[t.status];
  const assignee = t.assignee ? users[t.assignee] : path.length > 1 ? custodian : null;

  const ticket = await prisma.ticket.create({
    data: {
      propertyId: property.id,
      roomId: rooms[occupantRoom[t.reporter]].id,
      reporterId: reporter.id,
      faultItemId: item.id,
      assigneeId: assignee?.id ?? null,
      description: t.description,
      status: t.status,
      priority: item.defaultPriority,
      reopenCount: t.status === 'REOPENED' ? 1 : 0,
      dueAt: path.length
        ? new Date(createdAt.getTime() + respondWithinH[item.defaultPriority] * HOUR)
        : null,
      createdAt,
      closedAt: t.status === 'CLOSED' ? hoursAgo(1) : null,
    },
  });

  // Status history, spread evenly between the report and half an hour ago.
  let from = 'REPORTED';
  const step = (t.reportedH - 0.5) / (path.length + 1);
  for (const [i, [to, who]] of path.entries()) {
    const actor = who === 'resident' ? reporter : who === 'custodian' ? custodian : null;
    await prisma.auditLog.create({
      data: {
        propertyId: property.id,
        ticketId: ticket.id,
        actorId: actor?.id ?? null,
        action: 'ticket.status_changed',
        fromStatus: from,
        toStatus: to,
        createdAt: hoursAgo(t.reportedH - step * (i + 1)),
      },
    });
    from = to;
  }

  for (const v of t.visits ?? []) {
    await prisma.visit.create({
      data: {
        ticketId: ticket.id,
        custodianId: (assignee ?? custodian).id,
        scheduledAt: v.at,
        arrivedAt: v.arrivedH ? hoursAgo(v.arrivedH) : null,
        missed: v.missed ?? false,
        notes: v.notes ?? null,
      },
    });
  }

  if (t.proof) {
    await prisma.repairProof.create({
      data: { ticketId: ticket.id, submittedById: (assignee ?? custodian).id, notes: t.proof },
    });
  }
  if (t.status === 'CLOSED') {
    await prisma.verification.create({
      data: { ticketId: ticket.id, userId: reporter.id, confirmed: true },
    });
  }
  if (t.dispute) {
    await prisma.verification.create({
      data: { ticketId: ticket.id, userId: reporter.id, confirmed: false, comment: t.dispute },
    });
  }
  if (t.rating) {
    await prisma.rating.create({ data: { ticketId: ticket.id, userId: reporter.id, ...t.rating } });
  }
}

async function main() {
  await wipe();

  console.log('Demo data (OTP 123456 in dev):');
  for (const spec of PROPERTIES) {
    const { property, rooms, users, tickets } = await seedProperty(spec);
    console.log(
      `\n${property.name}: ${Object.keys(rooms).length} rooms, ${tickets} tickets. Logins:`,
    );
    for (const u of users) console.log(`  ${u.role.padEnd(9)} ${u.phone}  ${u.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
