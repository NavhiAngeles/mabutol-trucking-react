-- Interrupted uploads must be retryable before their proof metadata is committed.
-- Staged reads are restricted to the active assigned driver and their own objects.
CREATE POLICY "active driver reads staged own proof" ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='delivery-documents' AND owner=(SELECT auth.uid())
 AND (storage.filename(name) LIKE 'pod-photo-%' OR storage.filename(name) LIKE 'signature-%')
 AND EXISTS(SELECT 1 FROM public.users u JOIN public.drivers dr ON dr.user_id=u.id JOIN public.deliveries d ON d.driver_id=dr.id
 JOIN public.shipments s ON s.id=d.shipment_id WHERE u.id=(SELECT auth.uid()) AND u.is_active AND u.role='driver'
 AND (storage.foldername(name))[1]=d.id::text AND s.status NOT IN ('completed','cancelled')
 AND (d.status='in_transit' OR (d.status='delivered' AND d.proof_review_status='correction_requested'))));
CREATE POLICY "active driver cleans unlinked own proof" ON storage.objects FOR DELETE TO authenticated USING(
 bucket_id='delivery-documents' AND owner=(SELECT auth.uid())
 AND (storage.filename(name) LIKE 'pod-photo-%' OR storage.filename(name) LIKE 'signature-%')
 AND NOT EXISTS(SELECT 1 FROM public.delivery_documents doc WHERE doc.storage_path=name)
 AND EXISTS(SELECT 1 FROM public.users u JOIN public.drivers dr ON dr.user_id=u.id JOIN public.deliveries d ON d.driver_id=dr.id
 WHERE u.id=(SELECT auth.uid()) AND u.is_active AND u.role='driver' AND (storage.foldername(name))[1]=d.id::text));
