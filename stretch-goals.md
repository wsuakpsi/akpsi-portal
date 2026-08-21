# Stretch Goals

## Google Calendar Integration

### Sync description and dress code on event create
When `description` and `dress_code` DB columns are added to the `events` table, wire their values through the `AddEventForm` → `callLambda(ADD_TO_CALENDAR_URL, {...})` call in `Events.jsx`. The lambda signature already accepts `description` and `dressCode` — they're currently passed as `null`.

### Sync edits back to Google Calendar on event update
When event details are edited in EventDetail, check if the event has a `google_calendar_event_id` and call a new `updateEventOnCalendar` lambda (mirrors `addEventToCalendar` but uses `calendar.events.patch` instead of `calendar.events.insert`). Use the same formatted description block.
