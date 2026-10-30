-- Recorded from the applied Dev migration identity (CLI unavailable).
-- Optional address component; preserves existing rows and access policies.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS barangay text;
COMMENT ON COLUMN public.customers.barangay IS 'Optional barangay address component.';
-- Rollback is intentionally not automatic: dropping the column would lose saved addresses.
