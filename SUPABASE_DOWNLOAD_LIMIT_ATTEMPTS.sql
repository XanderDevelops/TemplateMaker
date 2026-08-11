-- Track free users who try to export more documents than the free row/page limit.
-- Raw IP addresses and fingerprints are never stored; the API writes keyed hashes.
-- anonymous_session_id is the same random browser session id used by activity_logs,
-- which lets the dashboard relate a limit attempt to later checkout activity.

create extension if not exists pgcrypto;

create table if not exists public.download_limit_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    anonymous_session_id text,
    template_title text not null default 'Untitled_Template',
    export_type text not null default 'document_export',
    limit_dimension text not null default 'documents',
    requested_output_count integer not null,
    free_limit smallint not null default 10,
    allowed_output_count smallint not null default 0,
    blocked_output_count integer not null,
    outcome text not null,
    device_hash text not null,
    browser_hash text not null,
    fingerprint_hash text not null,
    ip_hash text not null,
    fingerprint_ip_hash text not null,
    created_at timestamptz not null default now(),

    constraint download_limit_attempts_dimension_check
        check (limit_dimension in ('rows', 'pages', 'documents')),
    constraint download_limit_attempts_requested_check
        check (requested_output_count > free_limit),
    constraint download_limit_attempts_free_limit_check
        check (free_limit between 1 and 1000),
    constraint download_limit_attempts_allowed_check
        check (allowed_output_count between 0 and free_limit),
    constraint download_limit_attempts_blocked_check
        check (blocked_output_count >= 1),
    constraint download_limit_attempts_outcome_check
        check (outcome in ('partial_export_granted', 'daily_limit_reached', 'claim_failed'))
);

create index if not exists download_limit_attempts_created_at_idx
    on public.download_limit_attempts (created_at desc);

create index if not exists download_limit_attempts_user_created_at_idx
    on public.download_limit_attempts (user_id, created_at desc)
    where user_id is not null;

create index if not exists download_limit_attempts_session_created_at_idx
    on public.download_limit_attempts (anonymous_session_id, created_at desc)
    where anonymous_session_id is not null;

create index if not exists download_limit_attempts_dimension_created_at_idx
    on public.download_limit_attempts (limit_dimension, created_at desc);

create index if not exists download_limit_attempts_browser_created_at_idx
    on public.download_limit_attempts (browser_hash, created_at desc);

alter table public.download_limit_attempts enable row level security;

-- Analytics is written only by /api/free-export with the service key.
-- Visitors never receive direct read/write access to this table.
revoke all on table public.download_limit_attempts from anon, authenticated;
grant select, insert on table public.download_limit_attempts to service_role;

-- Enriched dashboard view. For an anonymous limit attempt, resolved_user_id can
-- be recovered when that same browser later logs in. payment_status therefore
-- becomes useful for measuring conversion after the limit was hit.
create or replace view public.download_limit_attempts_enriched as
with resolved as (
    select
        a.*,
        coalesce(
            a.user_id,
            (
                select al.user_id
                from public.activity_logs al
                where al.anonymous_session_id = a.anonymous_session_id
                  and al.user_id is not null
                  and al.created_at >= a.created_at - interval '1 hour'
                  and al.created_at <= a.created_at + interval '30 days'
                order by al.created_at asc
                limit 1
            )
        ) as resolved_user_id,
        (
            select min(al.created_at)
            from public.activity_logs al
            where al.anonymous_session_id = a.anonymous_session_id
              and al.event_name = 'download_limit_upgrade_clicked'
              and al.created_at >= a.created_at
              and al.created_at <= a.created_at + interval '30 days'
        ) as upgrade_clicked_at,
        (
            select min(al.created_at)
            from public.activity_logs al
            where al.anonymous_session_id = a.anonymous_session_id
              and al.event_name = 'checkout_started'
              and al.created_at >= a.created_at
              and al.created_at <= a.created_at + interval '30 days'
        ) as checkout_started_at
    from public.download_limit_attempts a
)
select
    r.*,
    coalesce(r.resolved_user_id::text, r.anonymous_session_id, r.browser_hash) as person_key,
    p.role as current_role,
    case
        when lower(coalesce(p.role, '')) in ('pro', 'admin') then 'converted_to_paid'
        when r.checkout_started_at is not null then 'checkout_started_not_currently_paid'
        when r.upgrade_clicked_at is not null then 'upgrade_clicked_not_checkout'
        else 'did_not_start_checkout'
    end as payment_status
from resolved r
left join public.profiles p on p.id = r.resolved_user_id;

revoke all on table public.download_limit_attempts_enriched from anon, authenticated;
grant select on table public.download_limit_attempts_enriched to service_role;

-- One-row-per-dimension overview for quick inspection in Supabase.
create or replace view public.download_limit_attempts_summary as
select
    limit_dimension,
    count(*) as total_attempts,
    count(distinct person_key) as unique_people,
    count(distinct person_key) filter (where outcome = 'partial_export_granted') as people_receiving_partial_export,
    count(distinct person_key) filter (where payment_status = 'converted_to_paid') as people_converted_to_paid,
    count(distinct person_key) filter (where payment_status = 'checkout_started_not_currently_paid') as people_started_checkout_but_not_paid,
    count(distinct person_key) filter (where payment_status = 'upgrade_clicked_not_checkout') as people_clicked_upgrade_but_not_checkout,
    count(distinct person_key) filter (where payment_status = 'did_not_start_checkout') as people_who_did_not_start_checkout,
    round(avg(requested_output_count)::numeric, 2) as average_requested_count,
    max(requested_output_count) as max_requested_count
from public.download_limit_attempts_enriched
group by limit_dimension;

revoke all on table public.download_limit_attempts_summary from anon, authenticated;
grant select on table public.download_limit_attempts_summary to service_role;
