-- Customer addresses must not acquire an assumed province.
ALTER TABLE public.customers ALTER COLUMN province DROP DEFAULT;

-- Repair only untouched phone signups from the contact-address rollout.
-- Retain edited profiles, older records, and explicitly supplied provinces.
UPDATE public.customers c SET province=NULL
FROM auth.users a
WHERE c.user_id=a.id AND c.province='Nueva Ecija'
 AND c.updated_at=c.created_at
 AND c.created_at>='2026-10-25T06:41:24Z'
 AND nullif(a.email,'') IS NULL
 AND a.raw_user_meta_data ? 'address'
 AND NOT (a.raw_user_meta_data ? 'province');
