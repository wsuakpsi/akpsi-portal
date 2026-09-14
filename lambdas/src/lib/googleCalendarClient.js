import { calendar as calendarApi, auth as googleAuth } from '@googleapis/calendar';

let calendarClient;

export async function getCalendarClient() {
  if (calendarClient) return calendarClient;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be set');

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const auth = new googleAuth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  calendarClient = calendarApi({ version: 'v3', auth });
  return calendarClient;
}
