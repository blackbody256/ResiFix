// Data isolation. PropertyScopeGuard attaches one of these to every authenticated request;
// get it with the @Scope() parameter decorator and pass EVERY property-owned query through it:
//
//   prisma.ticket.findMany({ where: scope.where<Prisma.TicketWhereInput>({ status: 'REPORTED' }) })
//   prisma.room.findMany({ where: scope.where<Prisma.RoomWhereInput>({}, 'block') })
//   prisma.photo.findFirst({ where: scope.where<Prisma.PhotoWhereInput>({ id }, 'ticket') })
//   prisma.ticket.create({ data: scope.data({ ...fields }) })
//
// `via` is the relation path from the model to something that has `propertyId`
// (dot-separated for deeper paths, e.g. 'room.block').
export class PropertyScope {
  constructor(readonly propertyId: string) {}

  where<W extends object>(where?: W, via?: string): W {
    let filter: Record<string, unknown> = { propertyId: this.propertyId };
    if (via) {
      for (const relation of via.split('.').reverse()) filter = { [relation]: filter };
    }
    return (where && Object.keys(where).length ? { AND: [where, filter] } : filter) as W;
  }

  /** For creates: force propertyId to the caller's property, ignoring anything client-supplied. */
  data<D extends object>(data: D): D & { propertyId: string } {
    return { ...data, propertyId: this.propertyId };
  }
}
