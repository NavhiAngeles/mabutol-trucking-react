-- New deliveries use the same Pricing setting as the website; existing amounts stay intact.
CREATE OR REPLACE FUNCTION public.stamp_delivery_allowance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE amount numeric;
BEGIN
 IF NEW.driver_allowance IS NULL THEN
  SELECT (value #>> '{}')::numeric INTO amount FROM public.system_settings WHERE key='driver_allowance';
  IF amount IS NULL THEN SELECT (value #>> '{}')::numeric INTO amount FROM public.system_settings WHERE key='default_driver_allowance';END IF;
  IF amount IS NOT NULL AND NOT(amount>=0 AND amount<1000000000) THEN RAISE EXCEPTION 'INVALID_DRIVER_ALLOWANCE';END IF;
  NEW.driver_allowance:=coalesce(amount,500);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_delivery_allowance() FROM PUBLIC,anon,authenticated;
