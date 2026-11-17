-- Migration: 20261107180000_compliance_notifications_producer.sql
-- Compliance & Maintenance Notifications Producer
-- Checks driver/truck compliance documents and scheduled maintenance against system_settings.compliance_thresholds
-- Generates deduplicated in-app notifications via notify_user() for opted-in office users (admin & staff).

CREATE OR REPLACE FUNCTION public.produce_compliance_notifications(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := coalesce(p_now, now());
  v_today date := (v_now AT TIME ZONE 'Asia/Manila')::date;
  v_settings jsonb;
  v_generated integer := 0;
  v_first int;
  v_critical int;
  v_days int;
  v_doc_type text;
  v_doc_label text;
  v_target_name text;
  v_title text;
  v_body text;
  rec record;
  u record;
BEGIN
  -- Prevent concurrent duplicate execution within the same transaction or overlapping workers
  PERFORM pg_advisory_xact_lock(hashtextextended('produce_compliance_notifications', 0));

  -- Caller check: allow postgres, service_role, or active office staff/admin
  IF current_user NOT IN ('postgres', 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND is_active
        AND role IN ('admin', 'staff')
    ) THEN
      RAISE EXCEPTION 'Office access required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Load compliance thresholds from system_settings
  SELECT value INTO v_settings
  FROM public.system_settings
  WHERE key = 'compliance_thresholds';

  -- 1. Check Driver & Truck Compliance Documents (latest document per entity and doc_type)
  FOR rec IN
    SELECT DISTINCT ON (
      coalesce(cd.driver_id, cd.truck_id),
      cd.doc_type,
      (CASE WHEN cd.remarks LIKE 'OR copy%' THEN 'or' WHEN cd.remarks LIKE 'CR copy%' THEN 'cr' ELSE '' END)
    )
      cd.id,
      cd.driver_id,
      cd.truck_id,
      cd.doc_type::text AS doc_type,
      cd.expiry_date,
      cd.review_status::text AS review_status,
      cd.remarks,
      dr.full_name AS driver_name,
      tr.plate_number AS truck_plate
    FROM public.compliance_documents cd
    LEFT JOIN public.drivers dr ON dr.id = cd.driver_id
    LEFT JOIN public.trucks tr ON tr.id = cd.truck_id
    WHERE cd.expiry_date IS NOT NULL
      AND cd.review_status::text <> 'rejected'
      AND (cd.driver_id IS NULL OR dr.status <> 'inactive')
      AND (cd.truck_id IS NULL OR tr.status <> 'inactive')
    ORDER BY
      coalesce(cd.driver_id, cd.truck_id),
      cd.doc_type,
      (CASE WHEN cd.remarks LIKE 'OR copy%' THEN 'or' WHEN cd.remarks LIKE 'CR copy%' THEN 'cr' ELSE '' END),
      cd.created_at DESC
  LOOP
    v_doc_type := rec.doc_type;
    v_days := rec.expiry_date - v_today;

    -- Resolve threshold limits
    CASE v_doc_type
      WHEN 'drivers_license' THEN
        v_first := coalesce((v_settings->'drivers_license'->>'first')::int, 60);
        v_critical := coalesce((v_settings->'drivers_license'->>'critical')::int, 15);
      WHEN 'medical_certificate' THEN
        v_first := coalesce((v_settings->'medical_certificate'->>'first')::int, 45);
        v_critical := coalesce((v_settings->'medical_certificate'->>'critical')::int, 10);
      WHEN 'nbi_clearance' THEN
        v_first := coalesce((v_settings->'nbi_clearance'->>'first')::int, 30);
        v_critical := coalesce((v_settings->'nbi_clearance'->>'critical')::int, 7);
      WHEN 'lto_registration' THEN
        v_first := coalesce((v_settings->'lto_registration'->>'first')::int, 45);
        v_critical := coalesce((v_settings->'lto_registration'->>'critical')::int, 15);
      WHEN 'insurance' THEN
        v_first := coalesce((v_settings->'insurance'->>'first')::int, 60);
        v_critical := coalesce((v_settings->'insurance'->>'critical')::int, 15);
      WHEN 'franchise_permit' THEN
        v_first := coalesce((v_settings->'franchise_permit'->>'first')::int, 60);
        v_critical := coalesce((v_settings->'franchise_permit'->>'critical')::int, 15);
      WHEN 'emission_test' THEN
        v_first := coalesce((v_settings->'emission_test'->>'first')::int, 21);
        v_critical := coalesce((v_settings->'emission_test'->>'critical')::int, 7);
      ELSE
        v_first := 30;
        v_critical := 7;
    END CASE;

    -- Human-friendly document label
    CASE v_doc_type
      WHEN 'drivers_license' THEN v_doc_label := 'Driver''s License';
      WHEN 'medical_certificate' THEN v_doc_label := 'Medical Certificate';
      WHEN 'nbi_clearance' THEN v_doc_label := 'NBI Clearance';
      WHEN 'lto_registration' THEN
        v_doc_label := CASE
          WHEN rec.remarks LIKE 'OR copy%' THEN 'LTO Official Receipt (OR)'
          WHEN rec.remarks LIKE 'CR copy%' THEN 'Certificate of Registration (CR)'
          ELSE 'OR/CR Registration'
        END;
      WHEN 'insurance' THEN v_doc_label := 'Insurance';
      WHEN 'franchise_permit' THEN v_doc_label := 'LTFRB Permit';
      WHEN 'emission_test' THEN v_doc_label := 'Emission Test';
      ELSE v_doc_label := replace(v_doc_type, '_', ' ');
    END CASE;

    v_target_name := coalesce(rec.driver_name, rec.truck_plate, 'Fleet Asset');

    -- Determine notification title and body based on threshold
    IF v_days < 0 THEN
      v_title := 'Compliance Expired: ' || v_doc_label || ' · ' || v_target_name;
      v_body := v_doc_label || ' for ' || v_target_name || ' expired on ' || to_char(rec.expiry_date, 'Mon DD, YYYY') || ' (' || abs(v_days) || ' ' || (CASE WHEN abs(v_days) = 1 THEN 'day' ELSE 'days' END) || ' ago). Renewal required.';
    ELSIF v_days <= v_critical THEN
      v_title := 'Critical Compliance: ' || v_doc_label || ' · ' || v_target_name;
      v_body := v_doc_label || ' for ' || v_target_name || ' expires in ' || v_days || ' ' || (CASE WHEN v_days = 1 THEN 'day' ELSE 'days' END) || ' (' || to_char(rec.expiry_date, 'Mon DD, YYYY') || '). Urgent renewal required.';
    ELSIF v_days <= v_first THEN
      v_title := 'Compliance Due Soon: ' || v_doc_label || ' · ' || v_target_name;
      v_body := v_doc_label || ' for ' || v_target_name || ' expires on ' || to_char(rec.expiry_date, 'Mon DD, YYYY') || ' (' || v_days || ' days remaining).';
    ELSE
      -- Outside alert threshold; skip
      CONTINUE;
    END IF;

    -- Deliver to all opted-in office users with deduplication
    FOR u IN
      SELECT users.id
      FROM public.users
      WHERE users.is_active
        AND users.role IN ('admin', 'staff')
        AND NOT EXISTS (
          SELECT 1 FROM public.notification_preferences np
          WHERE np.user_id = users.id
            AND np.type = 'compliance_expiry'
            AND np.channel = 'in_app'
            AND NOT np.enabled
        )
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = u.id
          AND n.type = 'compliance_expiry'
          AND n.title = v_title
          AND (
            n.read_at IS NULL
            OR (n.created_at AT TIME ZONE 'Asia/Manila')::date = v_today
          )
      ) THEN
        PERFORM public.notify_user(
          u.id,
          'compliance_expiry'::public.notification_type,
          v_title,
          v_body,
          NULL
        );
        v_generated := v_generated + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Check Scheduled Maintenance Records
  v_first := coalesce((v_settings->'maintenance'->>'first')::int, 14);
  v_critical := coalesce((v_settings->'maintenance'->>'critical')::int, 3);

  FOR rec IN
    SELECT
      mr.id,
      mr.truck_id,
      mr.kind::text AS kind,
      mr.status::text AS status,
      mr.scheduled_date,
      mr.description,
      tr.plate_number AS truck_plate
    FROM public.maintenance_records mr
    JOIN public.trucks tr ON tr.id = mr.truck_id
    WHERE mr.status::text = 'scheduled'
      AND mr.scheduled_date IS NOT NULL
      AND tr.status <> 'inactive'
    ORDER BY mr.scheduled_date ASC
  LOOP
    v_days := rec.scheduled_date - v_today;
    v_target_name := coalesce(rec.truck_plate, 'Truck');

    IF v_days < 0 THEN
      v_title := 'Maintenance Overdue · ' || v_target_name;
      v_body := 'Scheduled maintenance (' || coalesce(rec.kind, 'service') || ') for truck ' || v_target_name || ' was due on ' || to_char(rec.scheduled_date, 'Mon DD, YYYY') || ' (' || abs(v_days) || ' ' || (CASE WHEN abs(v_days) = 1 THEN 'day' ELSE 'days' END) || ' ago).';
    ELSIF v_days <= v_critical THEN
      v_title := 'Critical Maintenance · ' || v_target_name;
      v_body := 'Scheduled maintenance (' || coalesce(rec.kind, 'service') || ') for truck ' || v_target_name || ' is due in ' || v_days || ' ' || (CASE WHEN v_days = 1 THEN 'day' ELSE 'days' END) || ' (' || to_char(rec.scheduled_date, 'Mon DD, YYYY') || ').';
    ELSIF v_days <= v_first THEN
      v_title := 'Maintenance Due Soon · ' || v_target_name;
      v_body := 'Scheduled maintenance (' || coalesce(rec.kind, 'service') || ') for truck ' || v_target_name || ' is scheduled on ' || to_char(rec.scheduled_date, 'Mon DD, YYYY') || ' (' || v_days || ' days remaining).';
    ELSE
      -- Outside threshold
      CONTINUE;
    END IF;

    -- Deliver to all opted-in office users with deduplication
    FOR u IN
      SELECT users.id
      FROM public.users
      WHERE users.is_active
        AND users.role IN ('admin', 'staff')
        AND NOT EXISTS (
          SELECT 1 FROM public.notification_preferences np
          WHERE np.user_id = users.id
            AND np.type = 'compliance_expiry'
            AND np.channel = 'in_app'
            AND NOT np.enabled
        )
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = u.id
          AND n.type = 'compliance_expiry'
          AND n.title = v_title
          AND (
            n.read_at IS NULL
            OR (n.created_at AT TIME ZONE 'Asia/Manila')::date = v_today
          )
      ) THEN
        PERFORM public.notify_user(
          u.id,
          'compliance_expiry'::public.notification_type,
          v_title,
          v_body,
          NULL
        );
        v_generated := v_generated + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_generated;
END $$;

REVOKE ALL ON FUNCTION public.produce_compliance_notifications(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produce_compliance_notifications(timestamptz) TO authenticated;

-- Dev-only scheduled cron registration if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'mabutol-compliance-notifications',
      '0 0 * * *',
      'SELECT public.produce_compliance_notifications();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

