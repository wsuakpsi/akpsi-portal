import { AuthError, requireEboardCaller, requireSelfOrEboardCaller } from './auth.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function respond(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function parseBody(event) {
  return typeof event?.body === 'string' ? JSON.parse(event.body) : event || {};
}

// Every Lambda in this project runs with the service role key (bypasses
// RLS entirely), so `authenticate` is the only thing standing between
// "anyone with the API Gateway URL" and a write. `extractArgs(payload,
// caller)` receives the verified caller's own member row — use `caller.id`
// for any "who did this" field (createdBy, reviewedBy) instead of trusting
// the client to say who it is.
function makeHandler(authenticate, coreFn, extractArgs) {
  return async function handler(event) {
    let payload;
    try {
      payload = parseBody(event);
    } catch {
      return respond(400, { success: false, error: 'Invalid JSON body' });
    }

    try {
      const caller = await authenticate(event, payload);
      const args = extractArgs(payload, caller);
      const result = await coreFn(...args);
      return respond(result.success ? 200 : 400, result);
    } catch (err) {
      if (err instanceof AuthError) return respond(err.statusCode, { success: false, error: err.message });
      console.error(err);
      return respond(500, { success: false, error: err.message || 'Internal error' });
    }
  };
}

// For endpoints only E-Board may call: manual adjustments, form review,
// event completion, standing calculation, sheets sync.
export function wrapEboardHandler(coreFn, extractArgs) {
  return makeHandler(requireEboardCaller, coreFn, extractArgs);
}

// For endpoints a brother can call on their own behalf (QR self check-in,
// cancelling their own RSVP) — E-Board may also act on behalf of others
// (manual check-in, forced cancellation). `getSubjectMemberId` reads
// whichever field of the payload holds the target member_id.
export function wrapAuthedHandler(coreFn, extractArgs, getSubjectMemberId) {
  return makeHandler(
    (event, payload) => requireSelfOrEboardCaller(event, getSubjectMemberId(payload)),
    coreFn,
    extractArgs,
  );
}
