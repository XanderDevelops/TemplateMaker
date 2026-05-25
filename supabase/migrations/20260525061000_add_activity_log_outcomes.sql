-- Add first-class outcome fields for auth/download diagnostics.
-- Metadata still keeps the detailed event payload; these columns make filtering easier.

alter table public.activity_logs
    add column if not exists event_status text not null default 'info',
    add column if not exists error_code text,
    add column if not exists error_message text,
    add column if not exists email text,
    add column if not exists full_name text;

alter table public.activity_logs
    alter column event_status set default 'info';

update public.activity_logs
set event_status = 'info'
where event_status is null
   or event_status not in ('info', 'success', 'error', 'pending');

alter table public.activity_logs
    drop constraint if exists activity_logs_event_status_check;

alter table public.activity_logs
    add constraint activity_logs_event_status_check
    check (event_status in ('info', 'success', 'error', 'pending'));

alter table public.activity_logs
    alter column event_status set not null;

update public.activity_logs al
set
    email = coalesce(al.email, au.email),
    full_name = coalesce(
        al.full_name,
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name'
    )
from auth.users au
where al.user_id = au.id
  and (al.email is null or al.full_name is null);

create index if not exists activity_logs_event_status_created_at_idx
    on public.activity_logs (event_status, created_at desc);

create index if not exists activity_logs_email_created_at_idx
    on public.activity_logs (email, created_at desc);

create or replace function public.set_activity_log_user_identity()
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

drop trigger if exists set_activity_log_user_identity_trigger on public.activity_logs;

create trigger set_activity_log_user_identity_trigger
before insert on public.activity_logs
for each row
execute function public.set_activity_log_user_identity();
