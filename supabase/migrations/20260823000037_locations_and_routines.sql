-- ZELII: locais da família e rotinas recorrentes por pessoa.
-- Endereços são dados sensíveis de localização: permanecem no tenant e o
-- cálculo de rota só é executado quando alguém o solicita explicitamente.

alter table public.residences
  add column if not exists place_type text not null default 'OTHER',
  add column if not exists google_place_id text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table public.residences
  drop constraint if exists residences_place_type_check;

alter table public.residences
  add constraint residences_place_type_check check (place_type in (
    'HOME', 'SCHOOL', 'HEALTHCARE', 'ACADEMY', 'SPORT', 'THERAPY', 'OTHER'
  ));

create table if not exists public.family_routines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 150),
  routine_type text not null default 'OTHER' check (routine_type in (
    'SCHOOL', 'ACADEMY', 'SPORT', 'THERAPY', 'MEDICATION', 'OTHER'
  )),
  weekdays smallint[] not null default '{1,2,3,4,5}',
  starts_at time not null,
  ends_at time,
  arrival_buffer_minutes integer not null default 0 check (arrival_buffer_minutes between 0 and 240),
  residence_id uuid references public.residences(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at is null or ends_at > starts_at),
  check (array_length(weekdays, 1) is null or weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create index if not exists family_routines_tenant_person_idx
  on public.family_routines (tenant_id, person_id, is_active);

create trigger family_routines_set_updated_at
  before update on public.family_routines
  for each row execute function app.set_updated_at();

alter table public.family_routines enable row level security;
alter table public.family_routines force row level security;

drop policy if exists family_routines_access on public.family_routines;
create policy family_routines_access
  on public.family_routines for all to authenticated
  using (app.is_current_tenant(tenant_id))
  with check (app.is_current_tenant(tenant_id));

create index if not exists residences_tenant_place_type_idx
  on public.residences (tenant_id, place_type);
