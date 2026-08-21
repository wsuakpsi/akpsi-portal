import { getCalendarClient } from './lib/googleCalendarClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

// Creates a Google Calendar event for a chapter event. Called right after the
// event row is inserted to Supabase — calendar sync is best-effort: a failure
// here does NOT roll back the DB insert.
export async function addEventToCalendar(name, startsAt, location, category, durationMinutes = 120, isRequired = false, description = null, dressCode = null) {
  if (!name || !startsAt) return { success: false, error: 'name and startsAt are required' };
  if (!CALENDAR_ID) return { success: false, error: 'GOOGLE_CALENDAR_ID is not configured' };

  const calendar = await getCalendarClient();

  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const isMeeting = category === 'meeting';
  const lines = [];
  if (isMeeting) {
    lines.push('CHAPTER MEETING');
    if (dressCode) lines.push('', `Dress code: ${dressCode}`);
    if (isRequired) lines.push('Required:   Yes');
    if (description) lines.push('', description);
  } else {
    lines.push('── AKPsi Event ──────────────────');
    lines.push(`Category:   ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    if (dressCode) lines.push(`Dress code: ${dressCode}`);
    if (isRequired) lines.push('Required:   Yes');
    if (description) lines.push('', 'Description:', description);
  }

  const { data } = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: name,
      location: location || undefined,
      description: lines.join('\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return { success: true, calendarEventId: data.id, calendarEventUrl: data.htmlLink };
}

export const handler = wrapEboardHandler(addEventToCalendar, (payload) => [
  payload.name,
  payload.startsAt,
  payload.location,
  payload.category,
  payload.durationMinutes,
  payload.isRequired,
  payload.description,
  payload.dressCode,
]);
