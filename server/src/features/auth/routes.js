// OWNER: Ann
// TODO:
//   [ ] PB-001  (phone + OTP login — dev flow done; wire SMS provider, resident self-registration)
//   [ ] PB-002  (sessions/roles — JWT + requireRole done; add rate limiting on request-otp)
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { parse } from '../../lib/validate.js';
import { requestOtp, verifyOtp } from './service.js';

export const authRoutes = Router();

const phoneBody = z.object({ phone: z.string().min(9).max(20) });
const verifyBody = phoneBody.extend({ code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') });

// POST /api/auth/request-otp  { phone } -> { phone, expiresInSeconds }
authRoutes.post('/request-otp', async (req, res) => {
  const { phone } = parse(phoneBody, req.body);
  res.json(await requestOtp(phone));
});

// POST /api/auth/verify-otp  { phone, code } -> { token, user }
authRoutes.post('/verify-otp', async (req, res) => {
  const { phone, code } = parse(verifyBody, req.body);
  res.json(await verifyOtp(phone, code));
});

// GET /api/auth/me -> current user
authRoutes.get('/me', authenticate, (req, res) => {
  const { isActive: _isActive, ...user } = req.user;
  res.json({ user });
});
