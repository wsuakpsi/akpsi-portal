/**
 * Returns a Map<memberId, { total: number, [category]: number }> summing
 * every points_ledger row for the given semester, grouped by member and
 * category.
 */
export async function fetchMemberPointTotals(supabase, semesterId) {
  const { data, error } = await supabase
    .from('points_ledger')
    .select('member_id, category, delta')
    .eq('semester_id', semesterId);
  if (error) throw error;

  const totals = new Map();
  for (const row of data) {
    if (!totals.has(row.member_id)) {
      totals.set(row.member_id, { total: 0 });
    }
    const memberTotals = totals.get(row.member_id);
    memberTotals[row.category] = (memberTotals[row.category] || 0) + row.delta;
    memberTotals.total += row.delta;
  }
  return totals;
}

/**
 * Data needed for standing checks 2 (overall attendance %) and 3 (meeting
 * absence allowance), per spec 5.2. Both checks are computed off the same
 * generic `events`/`attendance`/`missing_meeting_forms` tables (not
 * `meeting_attendance`, which only tracks the roll-call status shown on the
 * Attendance page and isn't populated by check-in) so a required event of
 * any category — not just `category = 'meeting'` — counts.
 *
 * Returns:
 * - totalEvents: count of non-cancelled events this semester (check 2 denominator)
 * - requiredEventIds: Set of non-cancelled, is_required event ids (check 3 denominator)
 * - attendedByMember: Map<memberId, Set<eventId>> of attendance rows for non-cancelled events
 * - excusedCountByMember: Map<memberId, number> of approved missing_meeting_forms this semester
 * - excusedEventsByMember: Map<memberId, Set<eventId>> of which specific events those forms excuse
 */
export async function fetchStandingAttendanceData(supabase, semesterId) {
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, status, is_required')
    .eq('semester_id', semesterId);
  if (eventsError) throw eventsError;

  const activeEvents = events.filter((e) => e.status !== 'cancelled');
  const activeEventIds = activeEvents.map((e) => e.id);
  const requiredEventIds = new Set(activeEvents.filter((e) => e.is_required).map((e) => e.id));
  const totalEvents = activeEventIds.length;

  const attendedByMember = new Map();
  const excusedCountByMember = new Map();
  const excusedEventsByMember = new Map();

  if (activeEventIds.length > 0) {
    const { data: attendanceRows, error: attendanceError } = await supabase
      .from('attendance')
      .select('member_id, event_id')
      .in('event_id', activeEventIds);
    if (attendanceError) throw attendanceError;
    for (const row of attendanceRows) {
      if (!attendedByMember.has(row.member_id)) attendedByMember.set(row.member_id, new Set());
      attendedByMember.get(row.member_id).add(row.event_id);
    }

    // Voided forms (from the cancellation cascade) are excluded by both the
    // 'approved' filter and the activeEventIds restriction.
    const { data: formRows, error: formsError } = await supabase
      .from('missing_meeting_forms')
      .select('member_id, event_id')
      .eq('status', 'approved')
      .in('event_id', activeEventIds);
    if (formsError) throw formsError;
    for (const row of formRows) {
      excusedCountByMember.set(row.member_id, (excusedCountByMember.get(row.member_id) || 0) + 1);
      if (!excusedEventsByMember.has(row.member_id)) excusedEventsByMember.set(row.member_id, new Set());
      excusedEventsByMember.get(row.member_id).add(row.event_id);
    }
  }

  return { totalEvents, requiredEventIds, attendedByMember, excusedCountByMember, excusedEventsByMember };
}

/**
 * Returns a Map<memberId, { present: number, excused: number, unexcused: number }>
 * counting meeting_attendance rows across the semester's 'meeting' category events.
 */
export async function fetchMeetingAttendanceCounts(supabase, semesterId) {
  const { data: meetingEvents, error: eventsError } = await supabase
    .from('events')
    .select('id')
    .eq('semester_id', semesterId)
    .eq('category', 'meeting');
  if (eventsError) throw eventsError;

  const counts = new Map();
  const eventIds = meetingEvents.map((e) => e.id);
  if (eventIds.length === 0) return counts;

  const { data, error } = await supabase
    .from('meeting_attendance')
    .select('member_id, status')
    .in('event_id', eventIds);
  if (error) throw error;

  for (const row of data) {
    if (!counts.has(row.member_id)) {
      counts.set(row.member_id, { present: 0, excused: 0, unexcused: 0 });
    }
    counts.get(row.member_id)[row.status] += 1;
  }
  return counts;
}
