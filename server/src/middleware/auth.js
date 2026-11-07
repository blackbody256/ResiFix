// authenticate: verifies the Bearer JWT and loads req.user from the database (so deactivated
// users and role changes take effect immediately, not when the token expires).
// requireRole(...roles): use after authenticate.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../lib/httpError.js';

export async function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, propertyId: true, phone: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw unauthorized('Account not found or inactive');

  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
    next();
  };
}
