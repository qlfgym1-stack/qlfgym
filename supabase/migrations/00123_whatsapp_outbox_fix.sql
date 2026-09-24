-- 00123_whatsapp_outbox_fix.sql
-- Ajout des colonnes manquantes pour le système WhatsApp cron

-- Ajouter scheduled_for et delay_label à whatsapp_outbox
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_outbox' AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE public.whatsapp_outbox
      ADD COLUMN scheduled_for DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_outbox' AND column_name = 'delay_label'
  ) THEN
    ALTER TABLE public.whatsapp_outbox
      ADD COLUMN delay_label TEXT;
  END IF;
END $$;

-- Index pour la recherche par scheduled_for
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_scheduled ON public.whatsapp_outbox(scheduled_for, status);

-- Mettre à jour les entrées existantes avec un scheduled_for par défaut
UPDATE public.whatsapp_outbox
SET scheduled_for = created_at::date, delay_label = 'unknown'
WHERE scheduled_for IS NULL;

-- RLS : les admins peuvent voir les entrées par scheduled_for
-- (pas besoin de nouvelle policy, la policy existante couvre déjà la lecture)
