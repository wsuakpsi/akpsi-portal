-- ============================================================================
-- Phase 1a — Account lifecycle enum expansion + role/eboard_position atomicity
-- Run after 0002_rls_policies.sql.
--
-- Spec requires member.role to include pledge/alumni/archived (in addition to
-- brother/eboard) and member.status to include alumni/archived (in addition
-- to active/probation/suspended). Adding enum values must live in its own
-- migration/transaction — Postgres won't let a later statement in the SAME
-- transaction reference a value added earlier in that transaction.
-- ============================================================================

alter type member_role add value if not exists 'pledge';
alter type member_role add value if not exists 'alumni';
alter type member_role add value if not exists 'archived';

alter type member_status add value if not exists 'alumni';
alter type member_status add value if not exists 'archived';
