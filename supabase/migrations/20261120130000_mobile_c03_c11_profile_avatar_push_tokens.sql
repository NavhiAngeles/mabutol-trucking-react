-- Migration: 20261120130000_mobile_c03_c11_profile_avatar_push_tokens.sql
-- Implements Request C03 (customer barangay/province in mobile_save_profile)
-- and Request C11 (user_push_tokens table, registration RPCs, and optional FCM webhook trigger).
-- Note: mobile_workspace() / mobile_workspace_base() is updated in 20261120160000 with C03, D05, FTL-01, and C11 fields combined.

-- 1. C03: Ensure public.customers.barangay exists
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS barangay text;

COMMENT ON COLUMN public.customers.barangay IS 'Optional barangay address component.';

-- 2. C03: Extend mobile_save_profile with optional p_barangay and p_province parameters
-- Drop legacy 4-arg signature so PostgREST/Postgres calls with 4 args unambiguously resolve the 6-arg signature with defaults.
DROP FUNCTION IF EXISTS public.mobile_save_profile(text, text, text, text);
DROP FUNCTION IF EXISTS public.mobile_save_profile(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.mobile_save_profile(
  p_name text,
  p_phone text,
  p_address text,
  p_city text,
  p_barangay text DEFAULT NULL,
  p_province text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(p_name, ''))) NOT BETWEEN 2 AND 200
     OR p_phone IS NULL OR p_phone !~ '^\+639[0-9]{9}$'
     OR length(coalesce(p_address, '')) > 500
     OR length(coalesce(p_city, '')) > 100
     OR length(coalesce(p_barangay, '')) > 150
     OR length(coalesce(p_province, '')) > 100 THEN
    RAISE EXCEPTION 'INVALID_PROFILE';
  END IF;

  UPDATE public.users
  SET
    full_name = btrim(p_name),
    phone = p_phone,
    updated_at = now()
  WHERE id = auth.uid();

  UPDATE public.customers
  SET
    name = btrim(p_name),
    phone = p_phone,
    address = btrim(coalesce(p_address, '')),
    city = btrim(coalesce(p_city, '')),
    barangay = coalesce(nullif(btrim(p_barangay), ''), barangay),
    province = coalesce(nullif(btrim(p_province), ''), province),
    updated_at = now()
  WHERE user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_save_profile(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_save_profile(text, text, text, text, text, text) TO authenticated;

-- 3. C11: Optional FCM Push Token storage and registration RPCs
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL CHECK (length(btrim(token)) BETWEEN 20 AND 4096),
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  device_id text CHECK (device_id IS NULL OR length(device_id) <= 255),
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_tokens_user_token_key UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active
  ON public.user_push_tokens (user_id)
  WHERE is_active = true;

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own push tokens select" ON public.user_push_tokens;
CREATE POLICY "own push tokens select" ON public.user_push_tokens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own push tokens insert" ON public.user_push_tokens;
CREATE POLICY "own push tokens insert" ON public.user_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own push tokens update" ON public.user_push_tokens;
CREATE POLICY "own push tokens update" ON public.user_push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "own push tokens delete" ON public.user_push_tokens;
CREATE POLICY "own push tokens delete" ON public.user_push_tokens
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS trg_user_push_tokens_updated ON public.user_push_tokens;
CREATE TRIGGER trg_user_push_tokens_updated
  BEFORE UPDATE ON public.user_push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.mobile_register_push_token(
  p_token text,
  p_platform text DEFAULT 'android',
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_platform text := lower(btrim(coalesce(p_platform, 'android')));
  v_device text := nullif(btrim(coalesce(p_device_id, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND is_active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_token IS NULL OR length(v_token) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'INVALID_PUSH_TOKEN';
  END IF;

  IF v_platform NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'INVALID_PUSH_PLATFORM';
  END IF;

  IF v_device IS NOT NULL AND length(v_device) > 255 THEN
    RAISE EXCEPTION 'INVALID_DEVICE_ID';
  END IF;

  -- Deactivate this device token for any previous account signed in on the same device
  UPDATE public.user_push_tokens
  SET is_active = false, updated_at = now()
  WHERE token = v_token
    AND user_id <> v_uid
    AND is_active = true;

  INSERT INTO public.user_push_tokens (user_id, token, platform, device_id, is_active, last_seen_at)
  VALUES (v_uid, v_token, v_platform, v_device, true, now())
  ON CONFLICT (user_id, token) DO UPDATE
  SET
    platform = excluded.platform,
    device_id = coalesce(excluded.device_id, public.user_push_tokens.device_id),
    is_active = true,
    last_seen_at = now(),
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_register_push_token(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_register_push_token(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_unregister_push_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := nullif(btrim(coalesce(p_token, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_uid AND is_active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_token IS NOT NULL THEN
    UPDATE public.user_push_tokens
    SET is_active = false, updated_at = now()
    WHERE user_id = v_uid AND token = v_token AND is_active = true;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_unregister_push_token(text) TO authenticated;

-- 4. C11: Optional database webhook trigger on public.notifications AFTER INSERT
-- Dispatches an async pg_net POST only when pg_net is enabled, the user has active push tokens,
-- and an FCM webhook URL is configured (via Vault secret 'fcm_push_webhook_url' or system_settings).
CREATE OR REPLACE FUNCTION public.dispatch_notification_fcm_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_pg_net boolean := false;
  v_has_tokens boolean := false;
  v_webhook_url text;
  v_webhook_secret text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) INTO v_has_pg_net;

  IF NOT v_has_pg_net THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_push_tokens t
    WHERE t.user_id = NEW.user_id AND t.is_active = true
  ) INTO v_has_tokens;

  IF NOT v_has_tokens THEN
    RETURN NULL;
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE $q$
      SELECT nullif(btrim(decrypted_secret), '')
      FROM vault.decrypted_secrets
      WHERE name = 'fcm_push_webhook_url'
      LIMIT 1
    $q$ INTO v_webhook_url;

    EXECUTE $q$
      SELECT nullif(btrim(decrypted_secret), '')
      FROM vault.decrypted_secrets
      WHERE name = 'fcm_push_webhook_secret'
      LIMIT 1
    $q$ INTO v_webhook_secret;
  END IF;

  IF v_webhook_url IS NULL THEN
    SELECT nullif(btrim(value #>> '{}'), '')
    INTO v_webhook_url
    FROM public.system_settings
    WHERE key = 'fcm_push_webhook_url';
  END IF;

  IF v_webhook_url IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := v_webhook_url,
    headers := CASE
      WHEN v_webhook_secret IS NOT NULL THEN jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_webhook_secret
      )
      ELSE jsonb_build_object('Content-Type', 'application/json')
    END,
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'type', NEW.type,
      'title', NEW.title,
      'body', NEW.body,
      'shipment_id', NEW.shipment_id,
      'created_at', NEW.created_at
    )
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Push dispatch must never block notification creation
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_fcm_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notifications_fcm_push ON public.notifications;
CREATE TRIGGER trg_notifications_fcm_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_fcm_push();
