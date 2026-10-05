import { NextResponse } from "next/server";
import { fetchLive } from "@/lib/vag-live.ts";

// Aktuelle Verspaetungen je Buslinie (VAG live). Nur lesen, nichts wird gespeichert.
export async function GET() {
  const snap = await fetchLive();
  const lines = Object.values(snap.lines).sort((a, b) => b.medianDelaySec - a.medianDelaySec);
  return NextResponse.json({ fetchedAt: snap.fetchedAt, stationsOk: snap.stationsOk, stationsTotal: snap.stationsTotal, observations: snap.observations.length, lines });
}
