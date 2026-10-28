-- Private driver incident evidence and expense review. Existing records are retained.
-- Narrow private helper avoids a table INSERT -> storage SELECT -> linked table RLS cycle.
-- It only answers whether the active driver owns a bounded JPEG, never returns object data.
CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.driver_owns_evidence_image(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.users u JOIN storage.objects o ON o.owner=u.id
 WHERE u.id=auth.uid() AND u.is_active AND u.role='driver' AND o.bucket_id='delivery-documents' AND o.name=p_path
 AND o.metadata->>'mimetype'='image/jpeg' AND (o.metadata->>'size')::bigint BETWEEN 1 AND 5242880)
$$;
REVOKE ALL ON FUNCTION private.driver_owns_evidence_image(text) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.driver_owns_evidence_image(text) TO authenticated;
CREATE TABLE public.incident_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 incident_id uuid NOT NULL REFERENCES public.delivery_incidents(id) ON DELETE CASCADE,
 delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
 slot integer NOT NULL CHECK(slot BETWEEN 1 AND 3),
 storage_path text NOT NULL UNIQUE,
 uploaded_by uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(incident_id,slot),
 CHECK(storage_path=delivery_id::text||'/incident-'||incident_id::text||'-'||slot::text||'.jpg')
);
ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX incident_attachments_delivery_idx ON public.incident_attachments(delivery_id);
CREATE INDEX incident_attachments_uploader_idx ON public.incident_attachments(uploaded_by);
REVOKE ALL ON public.incident_attachments FROM anon,authenticated;
GRANT SELECT,INSERT ON public.incident_attachments TO authenticated;
CREATE POLICY "authorized incident evidence read" ON public.incident_attachments FOR SELECT TO authenticated USING (
 public.get_user_role() IN ('admin','staff') OR (public.get_user_role()='driver' AND EXISTS(
 SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.driver_id=public.my_driver_id())));
CREATE POLICY "assigned driver links own incident photo" ON public.incident_attachments FOR INSERT TO authenticated WITH CHECK (
 uploaded_by=auth.uid() AND public.get_user_role()='driver' AND EXISTS(
 SELECT 1 FROM public.delivery_incidents i JOIN public.deliveries d ON d.id=i.delivery_id
 WHERE i.id=incident_id AND i.delivery_id=incident_attachments.delivery_id AND i.reported_by=auth.uid()
 AND d.driver_id=public.my_driver_id() AND d.status IN ('assigned','loading','in_transit')
 AND private.driver_owns_evidence_image(storage_path)));
ALTER TABLE public.delivery_expenses ADD COLUMN review_reason text;
ALTER TABLE public.delivery_expenses ADD COLUMN description text CHECK(length(description)<=200);

CREATE POLICY "driver uploads incident evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='delivery-documents' AND public.get_user_role()='driver' AND owner=auth.uid() AND EXISTS(
 SELECT 1 FROM public.deliveries d WHERE d.driver_id=public.my_driver_id() AND d.status IN ('assigned','loading','in_transit')
 AND name ~ ('^'||d.id::text||'/incident-[0-9a-f-]{36}-[1-3][.]jpg$')));
-- Staged files are readable only by their active assigned uploader, for retry reconciliation.
CREATE POLICY "driver reads staged evidence and receipts" ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='delivery-documents' AND owner=auth.uid() AND public.get_user_role()='driver' AND EXISTS(
 SELECT 1 FROM public.deliveries d WHERE d.driver_id=public.my_driver_id() AND (storage.foldername(name))[1]=d.id::text
 AND (storage.filename(name) LIKE 'incident-%' OR storage.filename(name) LIKE 'receipt-%')));
CREATE POLICY "authorized recorded incident photo or receipt" ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='delivery-documents' AND public.get_user_role() IN ('driver','admin','staff') AND (
 EXISTS(SELECT 1 FROM public.incident_attachments a WHERE a.storage_path=name AND a.uploaded_by=owner)
 OR EXISTS(SELECT 1 FROM public.delivery_expenses e JOIN public.drivers dr ON dr.id=e.driver_id
 WHERE e.receipt_path=name AND dr.user_id=owner AND (storage.foldername(name))[1]=e.delivery_id::text)));
CREATE POLICY "driver cleans unlinked evidence and receipts" ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='delivery-documents' AND owner=auth.uid() AND public.get_user_role()='driver'
 AND (storage.filename(name) LIKE 'incident-%' OR storage.filename(name) LIKE 'receipt-%')
 AND NOT EXISTS(SELECT 1 FROM public.incident_attachments a WHERE a.storage_path=name)
 AND NOT EXISTS(SELECT 1 FROM public.delivery_expenses e WHERE e.receipt_path=name)
 AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.driver_id=public.my_driver_id() AND (storage.foldername(name))[1]=d.id::text));
DROP POLICY "driver_insert_own_expenses" ON public.delivery_expenses;
CREATE POLICY "driver_insert_own_expenses" ON public.delivery_expenses FOR INSERT TO authenticated WITH CHECK (
 public.get_user_role()='driver' AND driver_id=public.my_driver_id() AND status='pending'
 AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL AND amount BETWEEN 0.01 AND 1000000
 AND EXISTS(SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.driver_id=public.my_driver_id() AND d.status IN ('in_transit','delivered'))
 AND (receipt_path IS NULL OR (receipt_path LIKE delivery_id::text||'/receipt-%' AND private.driver_owns_evidence_image(receipt_path))));

CREATE FUNCTION public.driver_report_incident_evidence(p_delivery uuid,p_request uuid,p_category public.incident_category,p_description text,p_delay integer,p_paths text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid; path text; position integer:=0; existing public.delivery_incidents%ROWTYPE;
BEGIN
 IF public.get_user_role() IS DISTINCT FROM 'driver' THEN RAISE EXCEPTION 'ACTIVE_DRIVER_REQUIRED' USING ERRCODE='42501';END IF;
 IF cardinality(p_paths)>3 OR p_paths IS NULL THEN RAISE EXCEPTION 'INVALID_INCIDENT_PHOTOS';END IF;
 SELECT * INTO existing FROM public.delivery_incidents WHERE id=p_request AND delivery_id=p_delivery AND reported_by=auth.uid();
 IF FOUND THEN
  IF existing.category IS DISTINCT FROM p_category OR existing.description IS DISTINCT FROM btrim(p_description) OR existing.delay_minutes IS DISTINCT FROM p_delay
   OR p_paths IS DISTINCT FROM ARRAY(SELECT storage_path FROM public.incident_attachments WHERE incident_id=p_request ORDER BY slot)
  THEN RAISE EXCEPTION 'INCIDENT_REQUEST_CONFLICT';END IF;
  RETURN existing.id;
 END IF;
 result:=public.driver_report_incident(p_delivery,p_request,p_category,p_description,p_delay);
 FOREACH path IN ARRAY p_paths LOOP
  position:=position+1;
  INSERT INTO public.incident_attachments(incident_id,delivery_id,slot,storage_path,uploaded_by)
  VALUES(result,p_delivery,position,path,auth.uid());
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.mobile_driver_evidence(p_shipment uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF public.get_user_role() NOT IN ('driver','admin','staff') OR public.get_user_role() IS NULL THEN RAISE EXCEPTION 'ACTIVE_DRIVER_OR_OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deliveries WHERE shipment_id=p_shipment) THEN RAISE EXCEPTION 'SHIPMENT_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('expenses',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC,e.id) FROM public.delivery_expenses e JOIN public.deliveries d ON d.id=e.delivery_id WHERE d.shipment_id=p_shipment),'[]'::jsonb),
 'incident_evidence',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.slot) FROM public.incident_attachments a JOIN public.deliveries d ON d.id=a.delivery_id WHERE d.shipment_id=p_shipment),'[]'::jsonb));
END $$;
CREATE FUNCTION public.mobile_delivery_evidence_file(p_shipment uuid,p_kind text,p_record uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE records jsonb; path text;
BEGIN
 records:=public.mobile_driver_evidence(p_shipment);
 IF p_kind='incident' THEN SELECT a->>'storage_path' INTO path FROM jsonb_array_elements(records->'incident_evidence') a WHERE a->>'id'=p_record::text;
 ELSIF p_kind='expense' THEN SELECT a->>'receipt_path' INTO path FROM jsonb_array_elements(records->'expenses') a WHERE a->>'id'=p_record::text;
 END IF;
 IF path IS NULL THEN RAISE EXCEPTION 'RECORDED_FILE_NOT_FOUND' USING ERRCODE='42501';END IF;
 RETURN path;
END $$;
CREATE FUNCTION public.office_review_expense(p_expense uuid,p_expected timestamptz,p_status text,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE expense public.delivery_expenses%ROWTYPE;
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'OFFICE_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','rejected') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_EXPENSE_REVIEW';END IF;
 SELECT * INTO expense FROM public.delivery_expenses WHERE id=p_expense FOR UPDATE;
 IF NOT FOUND OR expense.updated_at IS DISTINCT FROM p_expected OR expense.status<>'pending' THEN RAISE EXCEPTION 'STALE_EXPENSE_REVIEW';END IF;
 UPDATE public.delivery_expenses SET status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=btrim(p_reason) WHERE id=expense.id;
END $$;
REVOKE ALL ON FUNCTION public.driver_report_incident_evidence(uuid,uuid,public.incident_category,text,integer,text[]),public.mobile_driver_evidence(uuid),public.mobile_delivery_evidence_file(uuid,text,uuid),public.office_review_expense(uuid,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_report_incident_evidence(uuid,uuid,public.incident_category,text,integer,text[]),public.mobile_driver_evidence(uuid),public.mobile_delivery_evidence_file(uuid,text,uuid),public.office_review_expense(uuid,timestamptz,text,text) TO authenticated;
