-- Busplaner Nuernberg: Datenmodell fuer Supabase (Postgres)
-- Ausfuehren im Supabase SQL Editor. Reihenfolge ist wichtig (Fremdschluessel).
--
-- Drei Bereiche:
--   A) Fahrplan (statisch, aus dem VGN-GTFS-Export; wird einmal geladen)
--   B) Betrieb  (Fahrer, Abwesenheiten, Plaene, Zuordnungen; aendert sich im Alltag)
--   C) Verkehr  (aufgezeichnete Verspaetungen und daraus abgeleitete Stau-Faktoren)
--
-- Zeiten: Minuten seit Mitternacht (int). Werte ueber 1440 sind erlaubt (Fahrt nach Mitternacht).

-- ============================================================
-- A) FAHRPLAN (statisch)
-- ============================================================

create table routes (
  id          text primary key,            -- GTFS route_id, z. B. "13-36-j26-1"
  short_name  text not null,               -- Liniennummer, z. B. "36"
  long_name   text not null,
  kind        text not null                -- "Stadtbus", "Linientaxi", ...
);

create table stops (
  id    text primary key,                  -- GTFS stop_id
  name  text not null,
  lat   double precision not null,
  lon   double precision not null
);

-- Fahrplantyp: an welchen Wochentagen und in welchem Zeitraum gefahren wird
create table services (
  id          text primary key,
  days        boolean[7] not null,         -- [Mo, Di, Mi, Do, Fr, Sa, So], Index 1 = Montag
  start_date  date,
  end_date    date
);

-- Ausnahmen: einzelne Tage, an denen ein Fahrplantyp zusaetzlich faehrt oder ausfaellt
create table service_exceptions (
  service_id  text not null references services(id) on delete cascade,
  date        date not null,
  type        text not null check (type in ('add', 'remove')),
  primary key (service_id, date, type)
);

create table trips (
  id          text primary key,            -- GTFS trip_id
  route_id    text not null references routes(id),
  service_id  text not null references services(id),
  direction   smallint not null default 0,
  headsign    text,
  block_id    text,                        -- Fahrzeugumlauf laut Fahrplan (nur bei wenigen Fahrten gesetzt)
  dep_min     int  not null,               -- Abfahrt am ersten Halt
  arr_min     int  not null,               -- Ankunft am letzten Halt
  from_stop   text not null references stops(id),
  to_stop     text not null references stops(id),
  stop_count  int  not null,
  check (arr_min > dep_min)
);
create index trips_route_idx   on trips (route_id);
create index trips_service_idx on trips (service_id);
create index trips_dep_idx     on trips (dep_min);

-- Typische Haltefolge je Linie und Richtung (fuer die Karte)
create table route_patterns (
  route_id   text not null references routes(id) on delete cascade,
  direction  smallint not null,
  stop_ids   text[] not null,
  primary key (route_id, direction)
);

-- Faehrt dieser Fahrplantyp an diesem Datum? (beruecksichtigt Ausnahmen)
create or replace function service_runs_on(sid text, d date)
returns boolean language sql stable as $$
  select case
    when exists (select 1 from service_exceptions e where e.service_id = sid and e.date = d and e.type = 'remove') then false
    when exists (select 1 from service_exceptions e where e.service_id = sid and e.date = d and e.type = 'add')    then true
    else coalesce((select (s.start_date is null or s.start_date <= d)
                      and (s.end_date   is null or d <= s.end_date)
                      and s.days[extract(isodow from d)::int]
                   from services s where s.id = sid), false)
  end
$$;

-- Alle Fahrten, die an einem Datum stattfinden (Eingabe fuer den Scheduler)
create or replace function trips_on_date(d date)
returns setof trips language sql stable as $$
  with running as (select id from services where service_runs_on(id, d))
  select t.* from trips t join running r on r.id = t.service_id
$$;

-- ============================================================
-- B) BETRIEB (aendert sich im Alltag)
-- ============================================================

create table drivers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  personnel_no  text unique,
  active        boolean not null default true,
  max_drive_min int not null default 540   -- Lenkzeit pro Tag, Standard 9 Stunden
);

-- Krank, Urlaub usw. Der Disponent pflegt das; der Scheduler plant diese Fahrer nicht ein.
create table driver_absences (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references drivers(id) on delete cascade,
  date_from  date not null,
  date_to    date not null,
  reason     text not null default 'krank' check (reason in ('krank', 'urlaub', 'sonstiges')),
  note       text,
  check (date_to >= date_from)
);
create index absences_driver_idx on driver_absences (driver_id, date_from, date_to);

-- Ein Dienstplan fuer einen Tag. Mehrere Staende pro Tag moeglich (stuendliche Aktualisierung).
create table plans (
  id          uuid primary key default gen_random_uuid(),
  plan_date   date not null,
  now_min     int  not null default 0,     -- "Jetzt": Fahrten davor gelten als gefahren und fix
  status      text not null default 'draft' check (status in ('draft', 'published')),
  params      jsonb not null default '{}', -- Regeln und Stau-Faktoren, mit denen gerechnet wurde
  coverage    numeric(5,2),                -- Deckungsgrad in Prozent
  created_by  text,
  created_at  timestamptz not null default now()
);
create index plans_date_idx on plans (plan_date, created_at desc);

-- Welcher Fahrer faehrt welche Fahrt. Nicht zugeordnete Fahrten = Luecken.
create table assignments (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  trip_id    text not null references trips(id),
  driver_id  uuid not null references drivers(id),
  locked     boolean not null default false,          -- gefahren oder manuell fixiert
  source     text not null default 'auto' check (source in ('auto', 'manual')),
  unique (plan_id, trip_id)
);
create index assignments_driver_idx on assignments (plan_id, driver_id);

-- Aenderungsprotokoll fuer die Oberflaeche ("Linie 36 +18 %, 3 Fahrten neu zugeordnet")
create table plan_events (
  id        bigserial primary key,
  plan_id   uuid not null references plans(id) on delete cascade,
  at        timestamptz not null default now(),
  kind      text not null check (kind in ('create', 'absence', 'traffic', 'manual', 'update')),
  message   text not null
);

-- ============================================================
-- C) VERKEHR
-- ============================================================

-- Rohdaten: eine Zeile pro gemessener Verspaetung (Cron ruft /api/record auf)
create table traffic_delays (
  id             bigserial primary key,
  recorded_at    timestamptz not null default now(),
  route_id       text not null references routes(id),
  trip_id        text,
  stop_id        text,
  delay_seconds  int  not null
);
create index delays_route_time_idx on traffic_delays (route_id, recorded_at);

-- Stau-Faktor je Linie, Wochentag und Stunde (1.00 = Fahrplanzeit, 1.20 = 20 % laenger).
-- Einfache Heuristik: durchschnittliche Verspaetung relativ zur typischen Fahrtdauer der Linie.
create or replace view traffic_factors with (security_invoker = true) as
with run as (
  select route_id, avg(arr_min - dep_min)::numeric as avg_trip_min
  from trips group by route_id
)
select d.route_id,
       extract(isodow from d.recorded_at at time zone 'Europe/Berlin')::int as weekday,
       extract(hour   from d.recorded_at at time zone 'Europe/Berlin')::int as hour,
       count(*) as samples,
       least(2.0, greatest(0.9,
         1 + (avg(d.delay_seconds) / 60.0) / nullif(r.avg_trip_min, 0))) as factor
from traffic_delays d
join run r using (route_id)
group by d.route_id, weekday, hour, r.avg_trip_min;

-- ============================================================
-- ZUGRIFF (Row Level Security)
-- Fahrplan und Stau-Faktoren: oeffentlich lesbar.
-- Betrieb: nur ueber den Server (service role key in den Next.js API-Routen), keine Policy fuer anon.
-- ============================================================

alter table routes             enable row level security;
alter table stops              enable row level security;
alter table services           enable row level security;
alter table service_exceptions enable row level security;
alter table trips              enable row level security;
alter table route_patterns     enable row level security;
alter table drivers            enable row level security;
alter table driver_absences    enable row level security;
alter table plans              enable row level security;
alter table assignments        enable row level security;
alter table plan_events        enable row level security;
alter table traffic_delays     enable row level security;

create policy "read routes"     on routes             for select using (true);
create policy "read stops"      on stops              for select using (true);
create policy "read services"   on services           for select using (true);
create policy "read exceptions" on service_exceptions for select using (true);
create policy "read trips"      on trips              for select using (true);
create policy "read patterns"   on route_patterns     for select using (true);
