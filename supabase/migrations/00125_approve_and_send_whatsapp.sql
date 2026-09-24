-- 00125_approve_and_send_whatsapp.sql
-- RPC d'approbation manuelle par l'admin
-- L'admin approuve une notification pending_manual → envoi immédiat

CREATE OR REPLACE FUNCTION public.approve_and_send_whatsapp(p_outbox_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.whatsapp_outbox%ROWTYPE;
  v_digits text;
  v_wa_url text;
BEGIN
  -- Récupérer l'entrée
  SELECT * INTO v_entry FROM public.whatsapp_outbox WHERE id = p_outbox_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
  
  -- Vérifier que c'est pending_manual
  IF v_entry.status != 'pending_manual' THEN
    RAISE EXCEPTION 'Notification is not pending approval (status: %)', v_entry.status;
  END IF;
  
  -- Formater le numéro téléphone au format international
  v_digits := REGEXP_REPLACE(v_entry.phone, '[^0-9]', '', 'g');
  IF LENGTH(v_digits) = 12 AND v_digits LIKE '213%' THEN
    -- déjà en format international (213XXXXXXXXXX)
    NULL;
  ELSIF LENGTH(v_digits) = 14 AND v_digits LIKE '00213%' THEN
    v_digits := '213' || SUBSTRING(v_digits FROM 6);
  ELSIF LENGTH(v_digits) = 10 AND v_digits LIKE '0%' THEN
    v_digits := '213' || SUBSTRING(v_digits FROM 2);
  ELSE
    RAISE EXCEPTION 'Invalid phone number format: %', v_entry.phone;
  END IF;
  
  -- Construire le lien WhatsApp (encodage URL côté client)
  v_wa_url := 'https://web.whatsapp.com/send?phone=' || v_digits || '&text=' || v_entry.message;
  
  -- Mettre à jour: status = sent_via_link, send_date = maintenant
  UPDATE public.whatsapp_outbox
  SET 
    status = 'sent_via_link',
    send_date = NOW()
  WHERE id = p_outbox_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'outbox_id', p_outbox_id,
    'whatsapp_url', v_wa_url,
    'member_name', v_entry.member_name,
    'phone', v_digits
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_and_send_whatsapp(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_send_whatsapp(UUID) TO service_role;
