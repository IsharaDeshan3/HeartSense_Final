











create extension if not exists vector;









create table if not exists profiles (

  id uuid references auth.users on delete cascade primary key,

  role text check (role in ('admin', 'seasoned', 'newbie')) default 'newbie',

  full_name text,

  email text,

  created_at timestamp with time zone default now(),

  updated_at timestamp with time zone default now()

);





alter table profiles enable row level security;





create policy "Users can view own profile" 

  on profiles for select 

  using (auth.uid() = id);



create policy "Users can update own profile" 

  on profiles for update 

  using (auth.uid() = id);



create policy "Admins can view all profiles"

  on profiles for select

  using (

    exists (

      select 1 from profiles 

      where id = auth.uid() and role = 'admin'

    )

  );





create or replace function public.handle_new_user()

returns trigger as $$

begin

  insert into public.profiles (id, full_name, email)

  values (new.id, new.raw_user_meta_data->>'full_name', new.email);

  return new;

end;

$$ language plpgsql security definer;



create trigger on_auth_user_created

  after insert on auth.users

  for each row execute procedure public.handle_new_user();









create table if not exists medical_knowledge (

  id uuid primary key default gen_random_uuid(),

  content text not null,

  embedding vector(384),

  source_type text check (source_type in ('pubmed', 'textbook', 'feedback', 'rare_case')),

  category text,

  severity text check (severity in ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),

  metadata jsonb default '{}',

  created_at timestamp with time zone default now(),

  updated_at timestamp with time zone default now()

);





create index if not exists medical_knowledge_embedding_idx 

  on medical_knowledge 

  using hnsw (embedding vector_cosine_ops);





alter table medical_knowledge enable row level security;





create policy "Anyone can read medical knowledge"

  on medical_knowledge for select

  using (true);





create policy "Authorized users can insert knowledge"

  on medical_knowledge for insert

  with check (

    exists (

      select 1 from profiles 

      where id = auth.uid() and role in ('admin', 'seasoned')

    )

  );









create table if not exists feedback_queue (

  id uuid primary key default gen_random_uuid(),

  doctor_id uuid references auth.users,

  original_diagnosis text not null,

  proposed_correction text not null,

  case_context jsonb not null,

  status text check (status in ('pending', 'approved', 'conflict', 'rejected')) default 'pending',

  admin_notes text,

  reviewed_by uuid references auth.users,

  reviewed_at timestamp with time zone,

  created_at timestamp with time zone default now()

);





alter table feedback_queue enable row level security;





create policy "Doctors can view own feedback"

  on feedback_queue for select

  using (doctor_id = auth.uid());





create policy "Doctors can submit feedback"

  on feedback_queue for insert

  with check (doctor_id = auth.uid());





create policy "Admins can view all feedback"

  on feedback_queue for select

  using (

    exists (

      select 1 from profiles 

      where id = auth.uid() and role = 'admin'

    )

  );





create policy "Admins can update feedback"

  on feedback_queue for update

  using (

    exists (

      select 1 from profiles 

      where id = auth.uid() and role = 'admin'

    )

  );









create table if not exists analysis_sessions (

  id uuid primary key default gen_random_uuid(),

  doctor_id uuid references auth.users,

  session_id text unique not null,

  



  history_text text,

  ecg_result jsonb,

  lab_result jsonb,

  bypassed jsonb default '{"ecg": false, "labs": false}',

  



  kra_output jsonb,

  ora_output jsonb,

  final_diagnosis text,

  confidence float,

  



  experience_level text,

  processing_time_ms int,

  created_at timestamp with time zone default now()

);





alter table analysis_sessions enable row level security;





create policy "Doctors can view own sessions"

  on analysis_sessions for select

  using (doctor_id = auth.uid());





create policy "Doctors can create sessions"

  on analysis_sessions for insert

  with check (doctor_id = auth.uid());





create policy "Admins can view all sessions"

  on analysis_sessions for select

  using (

    exists (

      select 1 from profiles 

      where id = auth.uid() and role = 'admin'

    )

  );









create or replace function search_medical_knowledge(

  query_embedding vector(384),

  match_threshold float default 0.3,

  match_count int default 5,

  filter_source text default null

)

returns table (

  id uuid,

  content text,

  similarity float,

  source_type text,

  category text,

  metadata jsonb,

  created_at timestamp with time zone

)

language plpgsql

as $$

begin

  return query

  select

    mk.id,

    mk.content,

    1 - (mk.embedding <=> query_embedding) as similarity,

    mk.source_type,

    mk.category,

    mk.metadata,

    mk.created_at

  from medical_knowledge mk

  where 

    1 - (mk.embedding <=> query_embedding) > match_threshold

    and (filter_source is null or mk.source_type = filter_source)

  order by mk.embedding <=> query_embedding

  limit match_count;

end;

$$;









create or replace function resolve_medical_conflict(

  input_emb vector(384), 

  input_diag text

)

returns table (is_conflict boolean, db_diag text) as $$

begin

  return query

  select 

    (mk.content != input_diag) as is_conflict,

    mk.content as db_diag

  from medical_knowledge mk

  where 1 - (mk.embedding <=> input_emb) > 0.6

  order by mk.embedding <=> input_emb

  limit 1;

end;

$$ language plpgsql;













create or replace function get_bypass_statistics()

returns jsonb as $$

declare

  result jsonb;

begin

  select jsonb_build_object(

    'total_cases', count(*),

    'ecg_bypassed', count(*) filter (where (bypassed->>'ecg')::boolean = true),

    'labs_bypassed', count(*) filter (where (bypassed->>'labs')::boolean = true),

    'both_bypassed', count(*) filter (

      where (bypassed->>'ecg')::boolean = true 

      and (bypassed->>'labs')::boolean = true

    )

  ) into result

  from analysis_sessions

  where created_at > now() - interval '30 days';

  

  return result;

end;

$$ language plpgsql;





create or replace function get_diagnosis_statistics()

returns jsonb as $$

declare

  result jsonb;

begin

  select jsonb_build_object(

    'total_analyses', count(*),

    'avg_confidence', avg(confidence),

    'low_confidence_count', count(*) filter (where confidence < 0.6),

    'high_confidence_count', count(*) filter (where confidence >= 0.8),

    'by_experience_level', jsonb_object_agg(

      coalesce(experience_level, 'unknown'),

      count(*)

    )

  ) into result

  from analysis_sessions

  where created_at > now() - interval '30 days';

  

  return result;

end;

$$ language plpgsql;









create or replace function update_updated_at_column()

returns trigger as $$

begin

  new.updated_at = now();

  return new;

end;

$$ language plpgsql;



create trigger update_profiles_updated_at

  before update on profiles

  for each row execute procedure update_updated_at_column();



create trigger update_medical_knowledge_updated_at

  before update on medical_knowledge

  for each row execute procedure update_updated_at_column();


-- ================================================================== --
--  NEW TABLES: 7-step KRA-ORA processing pipeline                    --
--  Run this block in Supabase SQL Editor if adding to existing DB    --
-- ================================================================== --

-- 1. Stores raw patient inputs + FAISS context (Step 3)
CREATE TABLE IF NOT EXISTS analysis_payloads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    symptoms_json   JSONB NOT NULL,
    history_json    JSONB NOT NULL DEFAULT '{}',
    ecg_json        JSONB NOT NULL DEFAULT '{}',
    labs_json       JSONB NOT NULL DEFAULT '{}',
    context_text    TEXT,
    quality_json    JSONB,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ap_session ON analysis_payloads(session_id);

-- 2. Stores KRA agent output (Step 5)
CREATE TABLE IF NOT EXISTS kra_outputs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    payload_id      UUID REFERENCES analysis_payloads(id),
    symptoms_text   TEXT,
    kra_output      JSONB NOT NULL DEFAULT '{}',
    raw_text        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ko_session ON kra_outputs(session_id);

-- 3. Stores ORA agent output (Step 7)
CREATE TABLE IF NOT EXISTS ora_outputs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       TEXT NOT NULL,
    kra_output_id    UUID REFERENCES kra_outputs(id),
    experience_level TEXT NOT NULL DEFAULT 'seasoned',
    refined_output   TEXT,
    disclaimer       TEXT,
    status           TEXT NOT NULL DEFAULT 'success',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oo_session ON ora_outputs(session_id);

-- RLS: allow service role full access (local app + HF Spaces use service key)
ALTER TABLE analysis_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE kra_outputs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ora_outputs        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ap" ON analysis_payloads
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_ko" ON kra_outputs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_oo" ON ora_outputs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

