-- Full Schema for Supabase Database
-- Purpose: Rebuild the database from scratch with all necessary tables, constraints, and indexes

begin;

-- ==============================
-- analysis_payloads table
-- ==============================
create table if not exists public.analysis_payloads (
    id serial primary key,
    input_profile text,
    ecg_status text,
    lab_status text,
    workflow_session_id text,
    source_tag text default 'workflow_v1',
    ecg_json jsonb,
    labs_json jsonb,
    session_id text,
    status text -- Added the missing status column
);

-- Safe backfill from existing json payloads
update public.analysis_payloads
set
  ecg_status = coalesce(ecg_status, nullif(ecg_json ->> 'status', '')),
  lab_status = coalesce(lab_status, nullif(labs_json ->> 'status', ''))
where true;

update public.analysis_payloads
set input_profile = coalesce(
  input_profile,
  case
    when coalesce(ecg_status, 'skipped') = 'present' and coalesce(lab_status, 'skipped') = 'present' then 'symptom_ecg_lab'
    when coalesce(ecg_status, 'skipped') = 'present' and coalesce(lab_status, 'skipped') <> 'present' then 'symptom_ecg_only'
    when coalesce(ecg_status, 'skipped') <> 'present' and coalesce(lab_status, 'skipped') = 'present' then 'symptom_lab_only'
    else 'symptom_only'
  end
)
where true;

-- Constraints
alter table public.analysis_payloads
  add constraint analysis_payloads_ecg_status_chk
  check (ecg_status is null or ecg_status in ('present', 'skipped', 'error'));

alter table public.analysis_payloads
  add constraint analysis_payloads_lab_status_chk
  check (lab_status is null or lab_status in ('present', 'skipped', 'error'));

alter table public.analysis_payloads
  add constraint analysis_payloads_input_profile_chk
  check (input_profile is null or input_profile in ('symptom_only', 'symptom_ecg_only', 'symptom_lab_only', 'symptom_ecg_lab'));

-- Trigger for deriving modality fields
create or replace function public.analysis_payloads_derive_modality_fields()
returns trigger
language plpgsql
as $$
begin
  new.ecg_status := coalesce(new.ecg_status, nullif(new.ecg_json ->> 'status', ''), 'skipped');
  new.lab_status := coalesce(new.lab_status, nullif(new.labs_json ->> 'status', ''), 'skipped');
  new.workflow_session_id := coalesce(new.workflow_session_id, new.session_id);

  new.input_profile := coalesce(
    new.input_profile,
    case
      when new.ecg_status = 'present' and new.lab_status = 'present' then 'symptom_ecg_lab'
      when new.ecg_status = 'present' and new.lab_status <> 'present' then 'symptom_ecg_only'
      when new.ecg_status <> 'present' and new.lab_status = 'present' then 'symptom_lab_only'
      else 'symptom_only'
    end
  );

  return new;
end;
$$;

drop trigger if exists trg_analysis_payloads_derive_modality_fields on public.analysis_payloads;
create trigger trg_analysis_payloads_derive_modality_fields
before insert or update on public.analysis_payloads
for each row execute function public.analysis_payloads_derive_modality_fields();

-- Indexes
create index if not exists idx_analysis_payloads_profile_status
  on public.analysis_payloads (input_profile, status);

create index if not exists idx_analysis_payloads_modality_status
  on public.analysis_payloads (ecg_status, lab_status);

-- ==============================
-- kra_outputs table
-- ==============================
create table if not exists public.kra_outputs (
    id serial primary key,
    payload_id int references public.analysis_payloads(id),
    payload_url text
);

-- Indexes
create index if not exists idx_kra_outputs_payload_id
  on public.kra_outputs (payload_id);

-- ==============================
-- ora_outputs table
-- ==============================
create table if not exists public.ora_outputs (
    id serial primary key,
    kra_output_id int references public.kra_outputs(id),
    kra_output_url text
);

-- Indexes
create index if not exists idx_ora_outputs_kra_output_id
  on public.ora_outputs (kra_output_id);

commit;
