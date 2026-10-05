import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchLive } from "@/lib/vag-live.ts";

// Zeichnet die aktuellen Verspaetungen in Supabase auf (Tabelle traffic_delays). Daraus lernt die Ansicht
// traffic_factors die typische Grundlast je Linie, Wochentag und Stunde.
//
// Aufruf stuendlich durch einen Zeitgeber (z. B. cron-job.org oder GitHub Actions), GET oder POST.
// Ist die Umgebungsvariable CRON_SECRET gesetzt, muss der Aufruf "Authorization: Bearer <CRON_SECRET>" senden.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht erlaubt" }, { status: 401 });
  }

  const snap = await fetchLive(true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ stored: 0, observations: snap.observations.length, note: "SUPABASE_SERVICE_ROLE_KEY fehlt, nichts gespeichert." });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const rows = snap.observations.map((o) => ({ line: o.line, stop_id: o.station, trip_id: o.tripNo, delay_seconds: Math.round(o.delaySec) }));
  const { error } = await sb.from("traffic_delays").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stored: rows.length, lines: Object.keys(snap.lines).length, fetchedAt: snap.fetchedAt });
}

export const GET = handle;
export const POST = handle;
