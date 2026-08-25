-- Migration 00107: one-shot cleanup — expire all overdue subscriptions + deactivate members
-- This fixes the backlog of ~200+ subscriptions that were still 'active' past their end_date

SELECT deactivate_expired_members();
