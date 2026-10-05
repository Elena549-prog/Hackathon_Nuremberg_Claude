#!/usr/bin/env python3
"""Wandelt die kompakten Bus-JSON-Dateien in CSV fuer den Supabase-Import um.

Aufruf:  python3 scripts/json_to_csv.py [data] [db/csv]
Import:  Supabase > Table Editor > Tabelle waehlen > Import data from CSV.
Reihenfolge: routes, stops, services, service_exceptions, trips, route_patterns.
"""
import csv, json, os, sys

src = sys.argv[1] if len(sys.argv) > 1 else "data"
out = sys.argv[2] if len(sys.argv) > 2 else "db/csv"
os.makedirs(out, exist_ok=True)
load = lambda n: json.load(open(f"{src}/{n}.json", encoding="utf-8"))


def write(name, header, rows):
    with open(f"{out}/{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        n = 0
        for r in rows:
            w.writerow(r)
            n += 1
    print(f"{out}/{name}.csv: {n} Zeilen")


def date(s):  # 20261212 -> 2026-12-12
    return f"{s[:4]}-{s[4:6]}-{s[6:]}" if s else ""


def pg_array(items):  # Postgres-Array-Literal
    return "{" + ",".join('"' + x.replace('"', '\\"') + '"' for x in items) + "}"


routes = load("bus_routes")
write("routes", ["id", "short_name", "long_name", "kind"], [[r["id"], r["name"], r["long"], r["kind"]] for r in routes])

stops = load("bus_stops")
write("stops", ["id", "name", "lat", "lon"], [[k, v["name"], v["lat"], v["lon"]] for k, v in stops.items()])

services = load("bus_services")
write("services", ["id", "days", "start_date", "end_date"],
      [[k, "{" + ",".join("true" if d else "false" for d in v["days"]) + "}", date(v["start"]), date(v["end"])] for k, v in services.items()])
write("service_exceptions", ["service_id", "date", "type"],
      [[k, date(d), t] for k, v in services.items() for t, ds in (("add", v["add"]), ("remove", v["remove"])) for d in ds])

trips = load("bus_trips")
write("trips", ["id", "route_id", "service_id", "direction", "headsign", "block_id", "dep_min", "arr_min", "from_stop", "to_stop", "stop_count"],
      [[t["id"], t["route"], t["service"], t["dir"], t["head"], t["block"] or "", t["dep"], t["arr"], t["from"], t["to"], t["n"]] for t in trips])

pats = load("bus_patterns")
write("route_patterns", ["route_id", "direction", "stop_ids"], [[p["route"], p["dir"], pg_array(p["stops"])] for p in pats])
