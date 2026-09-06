-- 00112_rfid_scan_fixes.sql
-- Support du correctif « bug RFID — mauvais membre affiché » (scan corrélé + garde).
-- Index purement additifs (IF NOT EXISTS) — aucun changement de données.

-- 1. Debounce rfid_check_in (00065) : SELECT MAX(read_at) FROM rfid_read_logs
--    WHERE card_uid = p_card_uid (fenêtre 3 s). Utile si rfid_read_logs grossit.
CREATE INDEX IF NOT EXISTS idx_rfid_read_logs_card_uid_read_at
  ON rfid_read_logs (card_uid, read_at DESC);

-- 2. Recherche d'attendance active (check-in sans check-out) pour un membre :
--    rfid_check_in 00065:857 + checkoutRfidMutation côté client (pointage.tsx).
CREATE INDEX IF NOT EXISTS idx_attendance_active_checkin
  ON attendance (member_id)
  WHERE check_in IS NOT NULL AND check_out IS NULL;

-- 3. Lookup carte ACTIF par UID : checkoutRfidMutation (pointage.tsx).
CREATE INDEX IF NOT EXISTS idx_rfid_cards_active_uid
  ON rfid_cards (rfid_uid)
  WHERE status = 'ACTIF';