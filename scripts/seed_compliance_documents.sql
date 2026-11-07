-- seed_compliance_documents.sql
-- Approves pending driver documents and establishes approved compliance records
-- for active test drivers and trucks in tanaw-dev so valid license/medical/NBI
-- and OR/CR/LTFRB/emission records exist.

BEGIN;

-- 1. Approve existing valid test documents for Nav Angeles
UPDATE public.compliance_documents
SET review_status = 'approved',
    reviewed_by = '1e4152aa-54e2-4a4e-86db-c022ed68c99d',
    reviewed_at = now()
WHERE driver_id = '326d2b9f-8725-47f2-a485-56a438fe88ac'
  AND review_status = 'pending_review'
  AND expiry_date >= current_date;

-- 2. Ensure Tanaw Dev Workflow Driver has valid approved driver compliance documents
INSERT INTO public.compliance_documents (
  driver_id, doc_type, document_number, issued_date, expiry_date,
  review_status, remarks, uploaded_by, reviewed_by, reviewed_at
)
SELECT
  'ec21297c-3d00-4d5f-b543-b8e019e2b764'::uuid,
  req.doc_type::public.compliance_doc_type,
  req.doc_num,
  current_date - interval '30 days',
  current_date + interval '730 days',
  'approved'::public.review_status,
  'Verified active test document for driver dispatch',
  '1e4152aa-54e2-4a4e-86db-c022ed68c99d'::uuid,
  '1e4152aa-54e2-4a4e-86db-c022ed68c99d'::uuid,
  now()
FROM (VALUES
  ('drivers_license', 'DL-DEV-WORKFLOW-01'),
  ('medical_certificate', 'MED-DEV-WORKFLOW-01'),
  ('nbi_clearance', 'NBI-DEV-WORKFLOW-01')
) AS req(doc_type, doc_num)
WHERE NOT EXISTS (
  SELECT 1 FROM public.compliance_documents cd
  WHERE cd.driver_id = 'ec21297c-3d00-4d5f-b543-b8e019e2b764'
    AND cd.doc_type = req.doc_type::public.compliance_doc_type
    AND cd.review_status = 'approved'
    AND cd.expiry_date >= current_date
);

-- 3. Ensure test trucks have valid approved OR/CR, LTFRB, and emission compliance records
INSERT INTO public.compliance_documents (
  truck_id, doc_type, document_number, issued_date, expiry_date,
  review_status, remarks, uploaded_by, reviewed_by, reviewed_at
)
SELECT
  t.id,
  req.doc_type::public.compliance_doc_type,
  t.plate_number || '-' || req.code,
  current_date - interval '30 days',
  current_date + interval '730 days',
  'approved'::public.review_status,
  'Approved compliance document for active fleet dispatch',
  '1e4152aa-54e2-4a4e-86db-c022ed68c99d'::uuid,
  '1e4152aa-54e2-4a4e-86db-c022ed68c99d'::uuid,
  now()
FROM public.trucks t
CROSS JOIN (VALUES
  ('lto_registration', 'ORCR'),
  ('franchise_permit', 'LTFRB'),
  ('emission_test', 'EMIS')
) AS req(doc_type, code)
WHERE t.plate_number IN (
  'DEMO-VAN-01', 'DEMO-VAN-02', 'DEMO-6W-02', 'DEMO-6W-03',
  'DEMO-ELF-01', 'DEMO-DROP-01', 'DEMO-WING-02', 'DEMO-HV10-01', 'DEMO-MED4-01'
)
AND NOT EXISTS (
  SELECT 1 FROM public.compliance_documents cd
  WHERE cd.truck_id = t.id
    AND cd.doc_type = req.doc_type::public.compliance_doc_type
    AND cd.review_status = 'approved'
    AND cd.expiry_date >= current_date
);

COMMIT;

