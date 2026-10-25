-- Contact details are separate from phone authentication; existing accounts are untouched.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE assigned_role public.user_role := 'customer';
BEGIN
 IF coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role') IN ('admin','staff','driver') THEN
  assigned_role := coalesce(new.raw_app_meta_data->>'provisioned_role',new.raw_app_meta_data->>'role')::public.user_role;
 END IF;
 INSERT INTO public.users(id,email,full_name,phone,role)
 VALUES(new.id,nullif(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),200),
  left(CASE WHEN nullif(new.phone,'') IS NOT NULL THEN '+'||ltrim(new.phone,'+') ELSE new.raw_user_meta_data->>'phone' END,30),assigned_role)
 ON CONFLICT(id) DO UPDATE SET email=excluded.email,updated_at=now();
 -- The existing users AFTER INSERT trigger creates the customer row first.
 -- Contact email is informational, never an Auth email or authorization claim.
 IF assigned_role = 'customer' THEN
  UPDATE public.customers
  SET email=coalesce(nullif(new.email,''),nullif(left(btrim(new.raw_user_meta_data->>'contact_email'),254),'')),
      address=nullif(left(btrim(new.raw_user_meta_data->>'address'),500),'')
  WHERE user_id=new.id;
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
