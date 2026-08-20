import { getSupabaseClient } from './lib/supabaseClient.js';
import { wrapEboardHandler } from './lib/httpResponse.js';
import { fetchMemberPointTotals, fetchStandingAttendanceData } from './lib/pointsAggregation.js';
import { getStandardThresholds, getLowerThresholds } from './lib/thresholds.js';
import { syncToGoogleSheets } from './syncToGoogleSheets.js';

const ATTENDANCE_RATE_MINIMUM = 0.55;
const MAX_EXCUSED_ABSENCES = 2;
const MAX_UNEXCUSED_ABSENCES = 1;

// Spec 10.3: three independent checks, a brother must pass all three to be
// in good standing. Results are locked (semester.calculated_at set) and
// every brother is notified of their result — status changes are a manual
// E-Board decision made afterward, this function never writes member.status.
export async function calculateEndOfSemesterStanding(semesterId, { confirm = false } = {}) {
  if (!semesterId) return { success: false, error: 'semesterId is required' };
  const supabase = getSupabaseClient();

  const { data: semester, error: semesterError } = await supabase
    .from('semesters')
    .select('id, name, calculated_at')
    .eq('id', semesterId)
    .maybeSingle();
  if (semesterError) return { success: false, error: semesterError.message };
  if (!semester) return { success: false, error: `Semester ${semesterId} not found` };
  if (semester.calculated_at && !confirm) {
    return {
      success: false,
      error: 'already_calculated',
      calculatedAt: semester.calculated_at,
    };
  }

  // Suspended members are skipped entirely — that status is sticky until an
  // E-Board member manually lifts it, and re-running standing on them could
  // misleadingly flip it. Members already on probation are still
  // re-evaluated each semester (they can be re-flagged, but this function
  // never reverts probation back to active).
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, full_name, status')
    .in('status', ['active', 'probation']);
  if (membersError) return { success: false, error: membersError.message };

  const { data: lowerApps, error: ltaError } = await supabase
    .from('lower_threshold_applications')
    .select('member_id')
    .eq('semester_id', semesterId)
    .eq('status', 'approved');
  if (ltaError) return { success: false, error: ltaError.message };
  const lowerThresholdMemberIds = new Set(lowerApps.map((a) => a.member_id));

  let totalsByMember;
  let attendanceData;
  try {
    totalsByMember = await fetchMemberPointTotals(supabase, semesterId);
    attendanceData = await fetchStandingAttendanceData(supabase, semesterId);
  } catch (err) {
    return { success: false, error: err.message };
  }
  const { totalEvents, requiredEventIds, attendedByMember, excusedCountByMember, excusedEventsByMember } =
    attendanceData;

  const standardThresholds = getStandardThresholds();
  const lowerThresholds = getLowerThresholds();

  const results = [];

  for (const member of members) {
    const totals = totalsByMember.get(member.id) || { total: 0 };
    const usesLowerThreshold = lowerThresholdMemberIds.has(member.id);
    const thresholds = usesLowerThreshold ? lowerThresholds : standardThresholds;

    let pointsCheck = totals.total >= thresholds.total;
    for (const [category, minimum] of Object.entries(thresholds)) {
      if (category === 'total') continue;
      if ((totals[category] || 0) < minimum) pointsCheck = false;
    }

    const attendedEvents = attendedByMember.get(member.id) || new Set();
    const attendancePercentage = totalEvents > 0 ? attendedEvents.size / totalEvents : 1;
    const attendanceCheck = attendancePercentage >= ATTENDANCE_RATE_MINIMUM;

    const excusedAbsences = excusedCountByMember.get(member.id) || 0;
    const excusedEvents = excusedEventsByMember.get(member.id) || new Set();
    let unexcusedAbsences = 0;
    for (const eventId of requiredEventIds) {
      if (!attendedEvents.has(eventId) && !excusedEvents.has(eventId)) unexcusedAbsences += 1;
    }
    const absenceCheck = excusedAbsences <= MAX_EXCUSED_ABSENCES && unexcusedAbsences <= MAX_UNEXCUSED_ABSENCES;

    const standing = pointsCheck && attendanceCheck && absenceCheck ? 'good' : 'probation';

    results.push({
      memberId: member.id,
      fullName: member.full_name,
      thresholdType: usesLowerThreshold ? 'lower' : 'standard',
      totals,
      checks: {
        points: pointsCheck,
        attendance: attendanceCheck,
        absences: absenceCheck,
      },
      attendancePercentage,
      excusedAbsences,
      unexcusedAbsences,
      standing,
    });
  }

  const { error: calculatedAtError } = await supabase
    .from('semesters')
    .update({ calculated_at: new Date().toISOString() })
    .eq('id', semesterId);
  if (calculatedAtError) return { success: false, error: calculatedAtError.message };

  const notifications = results.map((r) => ({
    member_id: r.memberId,
    title: r.standing === 'good' ? 'Semester standing: good standing' : 'Semester standing: probation',
    body:
      r.standing === 'good'
        ? `You're in good standing for "${semester.name}". Points: ${r.totals.total}, attendance: ${Math.round(
            r.attendancePercentage * 100,
          )}%.`
        : `You did not meet standing requirements for "${semester.name}" (checks failed: ${Object.entries(r.checks)
            .filter(([, passed]) => !passed)
            .map(([name]) => name)
            .join(', ')}). E-Board will follow up.`,
  }));
  const { error: notifError } = await supabase.from('notifications').insert(notifications);
  if (notifError) return { success: false, error: notifError.message };

  const sheetsResult = await syncToGoogleSheets(semesterId, { archive: true });

  return { success: true, semesterId, members: results, sheetsSync: sheetsResult };
}

export const handler = wrapEboardHandler(calculateEndOfSemesterStanding, (payload) => [
  payload.semesterId,
  { confirm: Boolean(payload.confirm) },
]);
