-- Durable state for the Governed Agent Layer demo: the whole mutable store
-- as one JSONB row (see lib/core/persist.ts for the rationale and limits).
--
-- Setup: Supabase dashboard → SQL Editor → paste this file → Run.
-- Then put the project's URL and service_role key in .env.local / Vercel env:
--   SUPABASE_URL=https://<project-ref>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY=<service_role key>

create table if not exists demo_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on, deliberately with no policies: the anon key can do nothing here.
-- Only the server-side service-role key (which bypasses RLS) reads or writes.
alter table demo_state enable row level security;
