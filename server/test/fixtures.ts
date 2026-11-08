// Test fixtures. Each test file builds its own properties with unique phone numbers and
// destroys them afterwards, so files can run in parallel against one test database.
//
//   const home = await createProperty(prisma, 'Home Hall');
//   const ticket = await createTicket(prisma, home, { reporter: home.residents[0], item: 'Leaking tap' });
//   ...
//   await destroyProperty(prisma, home.property.id);
import {
  type Block,
  type FaultCategory,
  type FaultItem,
  Priority,
  type PrismaClient,
  type Property,
  Role,
  type Room,
  type Ticket,
  TicketStatus,
  type User,
} from '@prisma/client';

type Db = Pick<
  PrismaClient,
  | '$transaction'
  | 'auditLog'
  | 'block'
  | 'duplicateLink'
  | 'faultCategory'
  | 'faultItem'
  | 'notification'
  | 'occupancy'
  | 'otpChallenge'
  | 'photo'
  | 'property'
  | 'pushSubscription'
  | 'rating'
  | 'repairProof'
  | 'responseTarget'
  | 'room'
  | 'ticket'
  | 'user'
  | 'verification'
  | 'visit'
>;

let sequence = 0;

/** A Ugandan-format number that will not collide with the seed (+2567000000xx) or other files. */
export function uniquePhone(): string {
  sequence += 1;
  const n = (process.pid * 1000 + sequence) % 10_000_000;
  return `+25679${String(n).padStart(7, '0')}`;
}

export const HOUR = 60 * 60 * 1000;

/** Catalogue every fixture property gets: category -> [item, default priority]. */
const CATALOGUE: Record<string, [string, Priority][]> = {
  Plumbing: [
    ['Leaking tap', Priority.MEDIUM],
    ['Blocked toilet', Priority.HIGH],
    ['No water', Priority.URGENT],
  ],
  Electrical: [
    ['No power in room', Priority.URGENT],
    ['Broken socket', Priority.HIGH],
    ['Bulb not working', Priority.LOW],
  ],
};

/** Property-wide response targets, the same as the demo seed: [priority, respond h, resolve h]. */
const TARGETS: [Priority, number, number][] = [
  [Priority.URGENT, 2, 24],
  [Priority.HIGH, 12, 48],
  [Priority.MEDIUM, 24, 72],
  [Priority.LOW, 48, 168],
];

/** Rooms per block, and which residents live where. */
const ROOMS: Record<string, string[]> = { 'Block A': ['101', '102'], 'Block B': ['201'] };
const RESIDENT_ROOMS = ['Block A-101', 'Block A-102', 'Block B-201'];

export interface PropertyFixture {
  property: Property;
  blocks: Record<string, Block>;
  /** Keyed "Block A-101". */
  rooms: Record<string, Room>;
  categories: Record<string, FaultCategory>;
  /** Keyed by item name, e.g. "Leaking tap". */
  items: Record<string, FaultItem>;
  admin: User;
  custodian: User;
  /** A second custodian, for assignment tests. */
  custodian2: User;
  /** residents[i] lives in RESIDENT_ROOMS[i]: A-101, A-102, B-201. */
  residents: User[];
  users: User[];
}

export async function createProperty(db: Db, name = 'Test Hall'): Promise<PropertyFixture> {
  const property = await db.property.create({ data: { name: `${name} ${uniquePhone()}` } });

  const blocks: PropertyFixture['blocks'] = {};
  const rooms: PropertyFixture['rooms'] = {};
  for (const [blockName, numbers] of Object.entries(ROOMS)) {
    const block = await db.block.create({ data: { propertyId: property.id, name: blockName } });
    blocks[blockName] = block;
    for (const number of numbers) {
      rooms[`${blockName}-${number}`] = await db.room.create({
        data: { blockId: block.id, number, capacity: 2 },
      });
    }
  }

  const categories: PropertyFixture['categories'] = {};
  const items: PropertyFixture['items'] = {};
  for (const [categoryName, entries] of Object.entries(CATALOGUE)) {
    const category = await db.faultCategory.create({
      data: { propertyId: property.id, name: categoryName },
    });
    categories[categoryName] = category;
    for (const [itemName, defaultPriority] of entries) {
      items[itemName] = await db.faultItem.create({
        data: { categoryId: category.id, name: itemName, defaultPriority },
      });
    }
  }

  await db.responseTarget.createMany({
    data: TARGETS.map(([priority, respondWithinH, resolveWithinH]) => ({
      propertyId: property.id,
      priority,
      respondWithinH,
      resolveWithinH,
    })),
  });

  const user = (role: Role, label: string) =>
    db.user.create({
      data: { propertyId: property.id, phone: uniquePhone(), name: `${label} (${name})`, role },
    });

  const admin = await user(Role.ADMIN, 'Admin');
  const custodian = await user(Role.CUSTODIAN, 'Custodian');
  const custodian2 = await user(Role.CUSTODIAN, 'Second custodian');
  const residents: User[] = [];
  for (const [i, roomKey] of RESIDENT_ROOMS.entries()) {
    const resident = await user(Role.RESIDENT, `Resident ${i + 1}`);
    await db.occupancy.create({ data: { userId: resident.id, roomId: rooms[roomKey].id } });
    residents.push(resident);
  }

  return {
    property,
    blocks,
    rooms,
    categories,
    items,
    admin,
    custodian,
    custodian2,
    residents,
    users: [admin, custodian, custodian2, ...residents],
  };
}

export interface TicketInput {
  reporter: User;
  /** Item name from the fixture catalogue. Default "Leaking tap". */
  item?: string;
  /** Room key such as "Block A-101". Default: the reporter's room. */
  room?: string;
  status?: TicketStatus;
  priority?: Priority;
  assignee?: User | null;
  description?: string;
  /** Backdate the report, e.g. `new Date(Date.now() - 30 * HOUR)` for an overdue ticket. */
  createdAt?: Date;
  dueAt?: Date | null;
}

export async function createTicket(
  db: Db,
  fx: PropertyFixture,
  input: TicketInput,
): Promise<Ticket> {
  const item = fx.items[input.item ?? 'Leaking tap'];
  if (!item) throw new Error(`Unknown fixture item "${input.item}"`);

  const roomKey = input.room ?? RESIDENT_ROOMS[fx.residents.indexOf(input.reporter)];
  const room = roomKey ? fx.rooms[roomKey] : undefined;
  if (!room)
    throw new Error('createTicket needs a room for a reporter who is not a fixture resident');

  return db.ticket.create({
    data: {
      propertyId: fx.property.id,
      roomId: room.id,
      reporterId: input.reporter.id,
      faultItemId: item.id,
      assigneeId: input.assignee?.id ?? null,
      description: input.description ?? `${item.name} (test)`,
      status: input.status ?? TicketStatus.REPORTED,
      priority: input.priority ?? item.defaultPriority,
      createdAt: input.createdAt,
      dueAt: input.dueAt ?? null,
    },
  });
}

/** Deletes a fixture property and everything that hangs off it, children first. */
export async function destroyProperty(db: Db, propertyId: string): Promise<void> {
  const phones = (await db.user.findMany({ where: { propertyId }, select: { phone: true } })).map(
    (u) => u.phone,
  );
  const ticket = { propertyId };

  await db.$transaction([
    db.auditLog.deleteMany({ where: { propertyId } }),
    db.notification.deleteMany({ where: { OR: [{ user: { propertyId } }, { ticket }] } }),
    db.pushSubscription.deleteMany({ where: { user: { propertyId } } }),
    db.rating.deleteMany({ where: { ticket } }),
    db.verification.deleteMany({ where: { ticket } }),
    db.photo.deleteMany({ where: { ticket } }),
    db.repairProof.deleteMany({ where: { ticket } }),
    db.visit.deleteMany({ where: { ticket } }),
    db.duplicateLink.deleteMany({ where: { OR: [{ ticket }, { canonical: ticket }] } }),
    db.ticket.deleteMany({ where: { propertyId } }),
    db.responseTarget.deleteMany({ where: { propertyId } }),
    db.faultItem.deleteMany({ where: { category: { propertyId } } }),
    db.faultCategory.deleteMany({ where: { propertyId } }),
    db.occupancy.deleteMany({ where: { user: { propertyId } } }),
    db.otpChallenge.deleteMany({ where: { phone: { in: phones } } }),
    db.user.deleteMany({ where: { propertyId } }),
    db.room.deleteMany({ where: { block: { propertyId } } }),
    db.block.deleteMany({ where: { propertyId } }),
    db.property.delete({ where: { id: propertyId } }),
  ]);
}
