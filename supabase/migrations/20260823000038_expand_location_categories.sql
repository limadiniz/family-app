-- ZELII: amplia as categorias de locais usados por compromissos e rotinas.
-- Locais personalizados continuam usando OTHER e um nome livre (label),
-- evitando limitar a família a um catálogo fechado.

alter table public.residences
  drop constraint if exists residences_place_type_check;

alter table public.residences
  add constraint residences_place_type_check check (place_type in (
    'HOME', 'SCHOOL', 'DAYCARE', 'HEALTHCARE', 'DENTIST', 'PHARMACY',
    'ACADEMY', 'SPORT', 'THERAPY', 'SALON', 'WORK', 'COURSE',
    'RELATIVE', 'RELIGIOUS', 'MARKET', 'OTHER'
  ));

alter table public.family_routines
  drop constraint if exists family_routines_routine_type_check;

alter table public.family_routines
  add constraint family_routines_routine_type_check check (routine_type in (
    'SCHOOL', 'DAYCARE', 'ACADEMY', 'SPORT', 'THERAPY', 'DENTIST',
    'HEALTHCARE', 'SALON', 'COURSE', 'MEDICATION', 'OTHER'
  ));

-- Tarefas também podem representar algo a fazer em um local específico
-- (por exemplo, buscar um documento, levar material ou comprar medicamento).
alter table public.tasks
  add column if not exists residence_id uuid;

alter table public.tasks
  drop constraint if exists tasks_residence_id_fkey;

alter table public.tasks
  add constraint tasks_residence_id_fkey
  foreign key (residence_id, tenant_id)
  references public.residences (id, tenant_id)
  on delete set null;

create index if not exists tasks_tenant_residence_idx
  on public.tasks (tenant_id, residence_id)
  where residence_id is not null;
