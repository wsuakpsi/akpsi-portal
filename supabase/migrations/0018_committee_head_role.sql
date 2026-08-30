-- ============================================================================
-- Committee Head role — a lighter-weight eboard-portal account that can only
-- create events. New enum values can't be used in the same transaction they
-- were added in, so this stays its own migration; the policy that uses it
-- lives in 0019.
-- ============================================================================

alter type member_role add value 'committee_head';
