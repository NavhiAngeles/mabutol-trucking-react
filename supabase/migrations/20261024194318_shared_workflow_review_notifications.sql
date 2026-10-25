CREATE OR REPLACE FUNCTION public.office_delivery_action(p_delivery uuid,p_expected timestamptz,p_action text,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.deliveries%ROWTYPE;s public.shipments%ROWTYPE;
BEGIN
 PERFORM public.require_active_office();
 SELECT * INTO d FROM public.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT FOUND OR p_expected IS NULL OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'DELIVERY_CHANGED_RELOAD' USING ERRCODE='40001';END IF;
 SELECT * INTO s FROM public.shipments WHERE id=d.shipment_id FOR UPDATE;
 IF s.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'DELIVERY_CLOSED';END IF;
 IF p_action='complete' THEN
  IF d.status<>'delivered' OR d.proof_review_status<>'pending_review'
  OR NOT EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND kind='proof_of_delivery')
  OR NOT EXISTS(SELECT 1 FROM public.delivery_documents WHERE delivery_id=d.id AND proof_attempt=d.proof_attempt AND kind='signature')
  OR EXISTS(SELECT 1 FROM public.delivery_incidents WHERE delivery_id=d.id AND resolved_at IS NULL) THEN RAISE EXCEPTION 'PROOF_AND_INCIDENT_REVIEW_REQUIRED';END IF;
  UPDATE public.deliveries SET proof_review_status='approved',proof_reviewed_by=auth.uid(),proof_reviewed_at=now() WHERE id=d.id;
  UPDATE public.shipments SET status='completed',actual_delivery_at=d.arrived_at WHERE id=s.id;
 ELSIF p_action='request_correction' THEN
  IF d.status<>'delivered' OR d.proof_review_status<>'pending_review' OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_PROOF_REVIEW';END IF;
  UPDATE public.deliveries SET proof_review_status='correction_requested',proof_review_reason=btrim(p_reason),proof_reviewed_by=auth.uid(),proof_reviewed_at=now() WHERE id=d.id;
 ELSIF p_action='cancel_no_show' THEN
  IF d.status<>'assigned' OR d.pickup_arrived_at IS NULL OR d.customer_showed_at IS NOT NULL OR d.auto_cancel_at IS NULL OR now()<d.auto_cancel_at
  OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'INVALID_NO_SHOW_REVIEW';END IF;
  UPDATE public.deliveries SET status='cancelled' WHERE id=d.id;
  UPDATE public.shipments SET status='cancelled',cancelled_reason=btrim(p_reason) WHERE id=s.id;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_OFFICE_ACTION';END IF;
 INSERT INTO public.shipment_events(shipment_id,delivery_id,event_type,actor_id,meta) VALUES(s.id,d.id,p_action,auth.uid(),jsonb_build_object('reason',p_reason,'attempt',d.proof_attempt));
END $$;

-- Trigger side effect only: callers cannot use notify_user to target arbitrary accounts.
CREATE FUNCTION public.notify_delivery_proof_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid;
BEGIN
 IF NEW.proof_review_status IS NOT DISTINCT FROM OLD.proof_review_status THEN RETURN NULL;END IF;
 SELECT dr.user_id INTO recipient FROM public.drivers dr WHERE dr.id=NEW.driver_id;
 PERFORM public.notify_user(recipient,'shipment_status'::public.notification_type,'Delivery proof review updated',coalesce(NEW.proof_review_reason,replace(NEW.proof_review_status,'_',' ')),NEW.shipment_id);
 SELECT c.user_id INTO recipient FROM public.customers c JOIN public.shipments s ON s.customer_id=c.id WHERE s.id=NEW.shipment_id;
 PERFORM public.notify_user(recipient,'shipment_status'::public.notification_type,'Delivery proof updated','Open your shipment for its current proof and review status.',NEW.shipment_id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.notify_delivery_proof_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notify_delivery_proof_review AFTER UPDATE OF proof_review_status ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_proof_review();
