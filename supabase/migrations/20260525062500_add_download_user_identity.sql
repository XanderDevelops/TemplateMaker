-- Add denormalized user identity fields to downloads for easier reporting.

alter table public.downloads
    add column if not exists email text,
    add column if not exists full_name text;

update public.downloads d
set
    email = coalesce(d.email, au.email),
    full_name = coalesce(
        d.full_name,
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name'
    )
from auth.users au
where d.user_id = au.id
  and (d.email is null or d.full_name is null);

create index if not exists downloads_email_created_at_idx
    on public.downloads (email, created_at desc);

create or replace function public.set_download_user_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    if new.user_id is not null then
        select
            coalesce(new.email, u.email),
            coalesce(
                new.full_name,
                u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name'
            )
        into new.email, new.full_name
        from auth.users u
        where u.id = new.user_id;
    end if;

    return new;
end;
$$;

drop trigger if exists set_download_user_identity_trigger on public.downloads;

create trigger set_download_user_identity_trigger
before insert on public.downloads
for each row
execute function public.set_download_user_identity();
