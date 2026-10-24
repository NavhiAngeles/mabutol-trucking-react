-- Account photos are private; every object is restricted to its user's folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('account-avatars','account-avatars',false,2097152,array['image/jpeg','image/png']);
create policy "account upload own avatar" on storage.objects for insert to authenticated
with check (bucket_id='account-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "account read own avatar" on storage.objects for select to authenticated
using (bucket_id='account-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "account cleanup own unlinked avatar" on storage.objects for delete to authenticated
using (bucket_id='account-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
and not exists(select 1 from public.users u where u.id=(select auth.uid()) and u.avatar_url=objects.name));
