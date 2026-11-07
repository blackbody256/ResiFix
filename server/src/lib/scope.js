// Data isolation. EVERY Prisma query that reads or writes property-owned data goes through
// scopeToProperty so a user can only ever see rows from their own property.
//
//   prisma.ticket.findMany(scopeToProperty(req.user, { where: { status: 'REPORTED' } }))
//   prisma.room.findMany(scopeToProperty(req.user, { where: {} }, 'block'))
//   prisma.photo.findFirst(scopeToProperty(req.user, { where: { id } }, 'ticket'))
//
// `via` is the relation path from the model to something that has `propertyId`
// (dot-separated for deeper paths, e.g. 'room.block').
import { forbidden } from './httpError.js';

export function scopeToProperty(user, query = {}, via) {
  if (!user?.propertyId) throw forbidden('User is not attached to a property');

  let filter = { propertyId: user.propertyId };
  if (via) {
    for (const relation of via.split('.').reverse()) filter = { [relation]: filter };
  }

  return {
    ...query,
    where: query.where ? { AND: [query.where, filter] } : filter,
  };
}

/** For creates: force propertyId to the caller's property, ignoring anything client-supplied. */
export function withProperty(user, data) {
  if (!user?.propertyId) throw forbidden('User is not attached to a property');
  return { ...data, propertyId: user.propertyId };
}
