-- =============================================================================
--  HeartSense AI -- Supabase Schema (full fresh install)
--  Run this entire file in the Supabase SQL Editor on a clean project.
--
--  Tables:
--    1. profiles               -- doctor / user accounts (linked to auth.users)
--    2. analysis_payloads      -- raw patient inputs for every analysis session
--    3. kra_outputs            -- KRA agent output per session
--    4. ora_outputs            -- ORA refined output per session
--
--  Views:
--    diagnosis_history         -- joined read-only view used by history queries
--
--  RLS is enabled on all tables with service-role bypass.
-- =============================================================================

-- ---------------------------------------------------------------------------
--  0.  Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------------
--  1.  profiles
-- ---------------------------------------------------------------------------

create table if not exists profiles (
    id          uuid        primary key references auth.users on delete cascade,
    role        text        not null default 'newbie'
                                check (role in ('admin', 'seasoned', 'newbie')),
    full_name   text,
    email       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, email)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
    before update on profiles
    for each row execute procedure public.set_updated_at();

alter table profiles enable row level security;

create policy "profiles: user reads own"
    on profiles for select
    using (auth.uid() = id);

create policy "profiles: user updates own"
    on profiles for update
    using (auth.uid() = id);

create policy "profiles: admin reads all"
    on profiles for select
    using (
        exists (
            select 1 from profiles p
            where p.id = auth.uid() and p.role = 'admin'
        )
    );

create policy "profiles: service role full access"
    on profiles
    using (auth.role() = 'service_role');


-- ---------------------------------------------------------------------------
--  2.  analysis_payloads
-- ---------------------------------------------------------------------------

create table if not exists analysis_payloads (
    id              uuid        primary key default gen_random_uuid(),
    session_id      text        not null,
    patient_id      text,
    doctor_id       text,

    symptoms_json   jsonb       not null default '{}',
    history_json    jsonb       not null default '{}',
    ecg_json        jsonb       not null default '{}',
    labs_json       jsonb       not null default '{}',

    context_text    text        not null default '',
    quality_json    jsonb       not null default '{}',

    status          text        not null default 'pending'
                                    check (status in ('pending', 'processing', 'completed', 'failed')),

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists analysis_payloads_session_id_idx  on analysis_payloads (session_id);
create index if not exists analysis_payloads_patient_id_idx  on analysis_payloads (patient_id);
create index if not exists analysis_payloads_created_at_idx  on analysis_payloads (created_at desc);

create trigger analysis_payloads_set_updated_at
    before update on analysis_payloads
    for each row execute procedure public.set_updated_at();

alter table analysis_payloads enable row level security;

create policy "analysis_payloads: service role full access"
    on analysis_payloads
    using (auth.role() = 'service_role');

create policy "analysis_payloads: authenticated read own"
    on analysis_payloads for select
    using (
        auth.role() = 'authenticated'
        and doctor_id = auth.uid()::text
    );


-- ---------------------------------------------------------------------------
--  3.  kra_outputs
-- ---------------------------------------------------------------------------

create table if not exists kra_outputs (
    id              uuid        primary key default gen_random_uuid(),
    session_id      text        not null,
    payload_id      uuid        references analysis_payloads (id) on delete cascade,
    patient_id      text,

    symptoms_text   text        not null default '',

    kra_output      jsonb       not null default '{}',
    raw_text        text,

    created_at      timestamptz not null default now()
);

create index if not exists kra_outputs_session_id_idx   on kra_outputs (session_id);
create index if not exists kra_outputs_payload_id_idx   on kra_outputs (payload_id);
create index if not exists kra_outputs_patient_id_idx   on kra_outputs (patient_id);
create index if not exists kra_outputs_created_at_idx   on kra_outputs (created_at desc);

alter table kra_outputs enable row level security;

create policy "kra_outputs: service role full access"
    on kra_outputs
    using (auth.role() = 'service_role');

create policy "kra_outputs: authenticated read"
    on kra_outputs for select
    using (auth.role() = 'authenticated');


-- ---------------------------------------------------------------------------
--  4.  ora_outputs
-- ---------------------------------------------------------------------------

create table if not exists ora_outputs (
    id                  uuid        primary key default gen_random_uuid(),
    session_id          text        not null,
    kra_output_id       uuid        references kra_outputs (id) on delete cascade,
    patient_id          text,

    experience_level    text        not null default 'seasoned'
                                        check (experience_level in ('NEWBIE', 'SEASONED', 'newbie', 'seasoned')),

    refined_output      text        not null default '',
    disclaimer          text,

    status              text        not null default 'success'
                                        check (status in ('success', 'partial', 'failed')),

    created_at          timestamptz not null default now()
);

create index if not exists ora_outputs_session_id_idx       on ora_outputs (session_id);
create index if not exists ora_outputs_kra_output_id_idx    on ora_outputs (kra_output_id);
create index if not exists ora_outputs_patient_id_idx       on ora_outputs (patient_id);
create index if not exists ora_outputs_created_at_idx       on ora_outputs (created_at desc);

alter table ora_outputs enable row level security;

create policy "ora_outputs: service role full access"
    on ora_outputs
    using (auth.role() = 'service_role');

create policy "ora_outputs: authenticated read"
    on ora_outputs for select
    using (auth.role() = 'authenticated');


-- ---------------------------------------------------------------------------
--  5.  diagnosis_history  (VIEW)
--      Read-only joined view used by get_patient_diagnosis_history().
-- ---------------------------------------------------------------------------

create or replace view diagnosis_history as
select
    ap.id                   as payload_id,
    ap.session_id,
    ap.patient_id,
    ap.doctor_id,
    ap.symptoms_json,
    ap.history_json,
    ap.ecg_json,
    ap.labs_json,
    ap.context_text,
    ap.quality_json,
    ap.status               as payload_status,
    ap.created_at,

    ko.id                   as kra_id,
    ko.kra_output,
    ko.raw_text             as kra_raw_text,
    ko.symptoms_text,

    oo.id                   as ora_id,
    oo.refined_output,
    oo.disclaimer,
    oo.status               as ora_status,
    oo.experience_level

from  analysis_payloads ap
left join kra_outputs  ko  on ko.session_id = ap.session_id
left join ora_outputs  oo  on oo.session_id = ap.session_id

order by ap.created_at desc;

grant select on diagnosis_history to authenticated;
grant select on diagnosis_history to service_role;
