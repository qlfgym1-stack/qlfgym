-- 00124_whatsapp_manual_approval.sql
-- Ajout du status 'pending_manual' et de la colonne 'send_date' à whatsapp_outbox
-- Activation de l'approbation manuelle par l'admin

-- S'assurer que la contrainte status inclut pending_manual (drop + add idempotent)
ALTER TABLE public.whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_status_check;

ALTER TABLE public.whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_status_check
  CHECK (status IN ('ready', 'sent_via_link', 'queued', 'sent', 'failed', 'pending_manual'));

-- Ajouter la colonne send_date si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_outbox' AND column_name = 'send_date'
  ) THEN
    ALTER TABLE public.whatsapp_outbox
      ADD COLUMN send_date TIMESTAMPTZ;
  END IF;
END $$;

-- Index pour la recherche des reminders en attente
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_pending ON public.whatsapp_outbox(status, delay_label, scheduled_for);

-- Commentaire
COMMENT ON TABLE public.whatsapp_outbox IS 'File de messages WhatsApp. Status pending_manual = en attente d''approbation admin. ready = prêt à être envoyé automatiquement.';