-- RLS manquante sur invoice_sequences (drift local/remote : la 00023 la prévoyait
-- mais elle n'était pas appliquée côté remote). La table n'est écrite que via le
-- RPC SECURITY DEFINER next_invoice_number et lue pour l'initialisation d'org.

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_invoice_sequences" ON public.invoice_sequences;
DROP POLICY IF EXISTS "admin_write_invoice_sequences" ON public.invoice_sequences;

CREATE POLICY "staff_read_invoice_sequences"
ON public.invoice_sequences
FOR SELECT
TO authenticated
USING (
  (SELECT role FROM public.user_roles WHERE user_id = auth.uid() AND organization_id = invoice_sequences.organization_id)
  IN ('admin', 'staff', 'coach')
);

CREATE POLICY "admin_write_invoice_sequences"
ON public.invoice_sequences
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND organization_id = invoice_sequences.organization_id AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND organization_id = invoice_sequences.organization_id AND role = 'admin'
  )
);