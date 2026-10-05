#!/usr/bin/env python3
"""Extrahiert die fuer den Busplaner relevanten Busdaten aus dem VGN-GTFS-Export.

Standard: nur Nuernberger Stadtbusse der VAG (route_id-Praefixe 13 = Tagesnetz,
16 = Nachtnetz, 17 = Sonderlinie). Aenderbar ueber --prefixes.

Aufruf:
  python3 scripts/extract_vag_buses.py <gtfs-ordner> [--out data] [--prefixes 13,16,17]
"""
import argparse, csv, json, os, collections


def rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def to_min(t):
    h, m, _ = t.split(":")          # GTFS erlaubt Stunden >= 24 (Fahrt nach Mitternacht)
    return int(h) * 60 + int(m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--out", default="data")
    ap.add_argument("--prefixes", default="13,16,17")
    a = ap.parse_args()
    prefixes = set(a.prefixes.split(","))
    os.makedirs(a.out, exist_ok=True)

    # 1) Routen: nur Busse (route_type 3) der gewaehlten Betreiber
    routes = {}
    for r in rows(f"{a.src}/routes.txt"):
        if r["route_type"] == "3" and r["route_id"].split("-")[0] in prefixes:
            routes[r["route_id"]] = {"id": r["route_id"], "name": r["route_short_name"],
                                     "long": r["route_long_name"], "kind": r["route_desc"]}

    # 2) Fahrten dieser Routen
    trips = {}
    for t in rows(f"{a.src}/trips.txt"):
        if t["route_id"] in routes:
            trips[t["trip_id"]] = {"id": t["trip_id"], "route": t["route_id"], "service": t["service_id"],
                                   "dir": int(t["direction_id"] or 0), "head": t["trip_headsign"],
                                   "block": t["block_id"] or None}

    # 3) stop_times streamen (145 MB): pro Fahrt Start/Ende + Haltefolge
    seq = collections.defaultdict(list)
    for s in rows(f"{a.src}/stop_times.txt"):
        if s["trip_id"] in trips:
            seq[s["trip_id"]].append((int(s["stop_sequence"]), s["stop_id"], s["arrival_time"], s["departure_time"]))

    used_stops = set()
    patterns = collections.defaultdict(collections.Counter)
    for tid, lst in seq.items():
        lst.sort()
        t = trips[tid]
        t["dep"] = to_min(lst[0][3]); t["arr"] = to_min(lst[-1][2])
        t["from"] = lst[0][1]; t["to"] = lst[-1][1]; t["n"] = len(lst)
        stops = tuple(x[1] for x in lst)
        used_stops.update(stops)
        patterns[(t["route"], t["dir"])][stops] += 1
    trips = {k: v for k, v in trips.items() if "dep" in v}

    # 4) Haltestellen, die vorkommen
    stops = {}
    for s in rows(f"{a.src}/stops.txt"):
        if s["stop_id"] in used_stops:
            stops[s["stop_id"]] = {"name": s["stop_name"], "lat": float(s["stop_lat"]), "lon": float(s["stop_lon"])}

    # 5) Kalender: nur Services, die diese Fahrten nutzen
    svc_ids = {t["service"] for t in trips.values()}
    services = {}
    for c in rows(f"{a.src}/calendar.txt"):
        if c["service_id"] in svc_ids:
            services[c["service_id"]] = {"days": [int(c[d]) for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")],
                                        "start": c["start_date"], "end": c["end_date"], "add": [], "remove": []}
    for c in rows(f"{a.src}/calendar_dates.txt"):
        if c["service_id"] in svc_ids:
            s = services.setdefault(c["service_id"], {"days": [0] * 7, "start": "", "end": "", "add": [], "remove": []})
            (s["add"] if c["exception_type"] == "1" else s["remove"]).append(c["date"])

    # 6) Haeufigste Haltefolge je Linie+Richtung (fuer die Karte)
    pats = [{"route": r, "dir": d, "stops": list(c.most_common(1)[0][0])} for (r, d), c in sorted(patterns.items())]

    def dump(name, obj):
        p = f"{a.out}/{name}.json"
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{p}: {os.path.getsize(p)/1024:.0f} KB")

    dump("bus_routes", sorted(routes.values(), key=lambda r: (len(r["name"]), r["name"])))
    dump("bus_trips", sorted(trips.values(), key=lambda t: (t["route"], t["dep"])))
    dump("bus_stops", stops)
    dump("bus_services", services)
    dump("bus_patterns", pats)
    print(f"{len(routes)} Linien, {len(trips)} Fahrten, {len(stops)} Haltestellen, {len(services)} Fahrplantypen")


if __name__ == "__main__":
    main()
