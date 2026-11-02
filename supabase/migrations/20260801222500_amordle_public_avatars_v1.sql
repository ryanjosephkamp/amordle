-- Amordle v6.4: public profile avatar object authority.
-- Public reads are intentional. Mutations remain owner-only through storage object ownership.

do $$
declare
  existing_bucket storage.buckets%rowtype;
begin
  select *
  into existing_bucket
  from storage.buckets
  where id = 'amordle-public-avatars-v1';

  if not found then
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    values (
      'amordle-public-avatars-v1',
      'amordle-public-avatars-v1',
      true,
      6291456,
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
    );
  elsif existing_bucket.name <> 'amordle-public-avatars-v1'
    or existing_bucket.public is distinct from true
    or existing_bucket.file_size_limit is distinct from 6291456
    or existing_bucket.allowed_mime_types is distinct from
      array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
  then
    raise exception
      'amordle-public-avatars-v1 already exists with incompatible authority';
  end if;
end;
$$;

drop policy if exists amordle_public_avatars_owner_read_v1 on storage.objects;
create policy amordle_public_avatars_owner_read_v1
on storage.objects
for select
to authenticated
using (
  bucket_id = 'amordle-public-avatars-v1'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists amordle_public_avatars_insert_v1 on storage.objects;
create policy amordle_public_avatars_insert_v1
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'amordle-public-avatars-v1'
  and name ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists amordle_public_avatars_update_v1 on storage.objects;
create policy amordle_public_avatars_update_v1
on storage.objects
for update
to authenticated
using (
  bucket_id = 'amordle-public-avatars-v1'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'amordle-public-avatars-v1'
  and name ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists amordle_public_avatars_delete_v1 on storage.objects;
create policy amordle_public_avatars_delete_v1
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'amordle-public-avatars-v1'
  and owner_id = (select auth.uid()::text)
);
