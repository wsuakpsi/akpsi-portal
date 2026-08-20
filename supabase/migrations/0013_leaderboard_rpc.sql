-- ============================================================================
-- Brother home dashboard leaderboard. points_ledger and members are both
-- locked down to "your own row or eboard" (0002's points_ledger_select /
-- members_select), so a plain brother can't query other members' totals
-- directly. This SECURITY DEFINER function exposes just enough — full_name
-- and a summed point total per member for a given semester — for a
-- leaderboard, without opening up per-category ledger rows or full member
-- profiles to every brother.
-- ============================================================================

create function get_leaderboard(p_semester_id uuid)
returns table (member_id uuid, full_name text, total_points bigint)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.full_name, coalesce(sum(pl.delta), 0)::bigint as total_points
  from members m
  left join points_ledger pl
    on pl.member_id = m.id and pl.semester_id = p_semester_id
  where m.status in ('active', 'probation')
  group by m.id, m.full_name
  order by total_points desc, m.full_name asc
  limit 10;
$$;

grant execute on function get_leaderboard(uuid) to authenticated;
