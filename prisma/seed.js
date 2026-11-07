// Demo data for local development. Safe to re-run: it wipes and recreates everything.
// Run with `npm run seed` (also runs automatically after `npm run db:reset`).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

// Demo logins (dev OTP is 123456):
const DEMO_USERS = [
  { phone: '+256700000001', name: 'Grace Custodian', role: 'CUSTODIAN' },
  { phone: '+256700000002', name: 'Moses Admin', role: 'ADMIN' },
  { phone: '+256700000010', name: 'Aisha Resident', role: 'RESIDENT', room: ['A', '101'] },
  { phone: '+256700000011', name: 'Brian Resident', role: 'RESIDENT', room: ['A', '102'] },
  { phone: '+256700000012', name: 'Clare Resident', role: 'RESIDENT', room: ['B', '201'] },
  { phone: '+256700000013', name: 'David Resident', role: 'RESIDENT', room: ['B', '201'] },
];

const BLOCKS = {
  A: ['101', '102', '103', '104'],
  B: ['201', '202', '203', '204'],
};

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

// [priority, respondWithinH, resolveWithinH] — property-wide defaults (categoryId = null)
const TARGETS = [
  ['URGENT', 2, 24],
  ['HIGH', 12, 48],
  ['MEDIUM', 24, 72],
  ['LOW', 48, 168],
];

async function wipe() {
  // Children first. Keep in sync with schema.prisma when models are added.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
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

async function main() {
  await wipe();

  const property = await prisma.property.create({
    data: { name: 'Kikoni Demo Hostel', address: 'Kikoni, near Makerere University, Kampala' },
  });

  const rooms = {}; // "A-101" -> room
  for (const [blockName, numbers] of Object.entries(BLOCKS)) {
    const block = await prisma.block.create({
      data: { propertyId: property.id, name: `Block ${blockName}` },
    });
    for (const number of numbers) {
      rooms[`${blockName}-${number}`] = await prisma.room.create({
        data: { blockId: block.id, number, capacity: 2 },
      });
    }
  }

  for (const u of DEMO_USERS) {
    const user = await prisma.user.create({
      data: { propertyId: property.id, phone: u.phone, name: u.name, role: u.role },
    });
    if (u.room) {
      await prisma.occupancy.create({
        data: { userId: user.id, roomId: rooms[u.room.join('-')].id },
      });
    }
  }

  for (const [categoryName, items] of Object.entries(FAULTS)) {
    await prisma.faultCategory.create({
      data: {
        propertyId: property.id,
        name: categoryName,
        items: { create: items.map(([name, defaultPriority]) => ({ name, defaultPriority })) },
      },
    });
  }

  await prisma.responseTarget.createMany({
    data: TARGETS.map(([priority, respondWithinH, resolveWithinH]) => ({
      propertyId: property.id,
      priority,
      respondWithinH,
      resolveWithinH,
    })),
  });

  console.log(`Seeded "${property.name}" with ${Object.keys(rooms).length} rooms.`);
  console.log('Demo logins (OTP 123456 in dev):');
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(9)} ${u.phone}  ${u.name}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
