import jwt from 'jsonwebtoken';

// Spec 6.6: QR expiry is "event end time or fixed 2-hour window". Events
// have no explicit end time in this schema, so a fixed window from
// generation time is used.
export const CHECKIN_WINDOW_HOURS = 2;

function getSecret() {
  const secret = process.env.QR_CHECKIN_JWT_SECRET;
  if (!secret) throw new Error('QR_CHECKIN_JWT_SECRET must be set');
  return secret;
}

export function signCheckInToken(eventId, expiresAt) {
  const expiresInSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign({ eventId }, getSecret(), { expiresIn: expiresInSeconds });
}

// Throws if the token is malformed, unsigned by us, or expired — callers
// should catch and translate to a { success: false } response rather than
// letting it bubble as a 500.
export function verifyCheckInToken(token) {
  const payload = jwt.verify(token, getSecret());
  if (!payload.eventId) throw new Error('Token missing eventId');
  return { eventId: payload.eventId };
}
