-- Allow download/survey rows created by the server-side tracking endpoint
-- to represent visitors who are not signed in. RLS remains enabled and no
-- anonymous client policy is added; the endpoint writes with the service key.

alter table public.downloads
    alter column user_id drop not null,
    add column if not exists anonymous_session_id text;

create index if not exists downloads_anonymous_session_created_at_idx
    on public.downloads (anonymous_session_id, created_at desc)
    where user_id is null;

alter table public.surveys
    alter column user_id drop not null;
