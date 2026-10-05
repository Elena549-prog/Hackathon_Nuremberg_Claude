// Dienstplan eines einzelnen Fahrers: Fahrten, Pausen, Schichtzeiten und Regelpruefung.
// Reine Funktionen (ohne Oberflaeche), damit sie sich testen lassen.

import type { PlanDriver, PlanTrip } from "./api-types.ts";
import { DEFAULT_RULES } from "./types.ts";

export type RosterRow =
  | { kind: "trip"; trip: PlanTrip }
  | { kind: "gap"; from: number; to: number; min: number; label: "Wendezeit" | "Wartezeit" | "Pause" };

export interface RosterCheck { ok: boolean; label: string; detail: string }

export interface Roster {
  rows: RosterRow[];
  start: number | null;
  end: number | null;
  spanMin: number;
  driveMin: number;
  breakMin: number; // Summe der Pausen ab 45 Minuten
  tripCount: number;
  lines: string[];
  checks: RosterCheck[];
}

export const fmtMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const fmtDur = (m: number) => `${Math.floor(m / 60)} Std. ${String(m % 60).padStart(2, "0")} Min.`;

export function buildRoster(driver: Pick<PlanDriver, "trips">): Roster {
  const trips = [...driver.trips].sort((a, b) => a.dep - b.dep);
  const r = DEFAULT_RULES;
  const rows: RosterRow[] = [];
  let driveMin = 0, breakMin = 0, cont = 0, maxCont = 0;

  trips.forEach((t, i) => {
    if (i > 0) {
      const prev = trips[i - 1];
      const gap = t.dep - prev.arr;
      if (gap > 0) {
        const label = gap >= r.breakMin ? "Pause" : gap >= 15 ? "Wartezeit" : "Wendezeit";
        rows.push({ kind: "gap", from: prev.arr, to: t.dep, min: gap, label });
        if (gap >= r.breakMin) { breakMin += gap; cont = 0; }
      }
    }
    rows.push({ kind: "trip", trip: t });
    const dur = t.arr - t.dep;
    driveMin += dur;
    cont += dur;
    maxCont = Math.max(maxCont, cont);
  });

  const start = trips.length ? trips[0].dep : null;
  const end = trips.length ? trips[trips.length - 1].arr : null;
  const spanMin = start !== null && end !== null ? end - start : 0;

  const checks: RosterCheck[] = [
    { ok: driveMin <= r.maxDriveMin, label: "Lenkzeit", detail: `${fmtDur(driveMin)} von höchstens ${fmtDur(r.maxDriveMin)}` },
    { ok: spanMin <= r.maxSpanMin, label: "Schichtlänge", detail: `${fmtDur(spanMin)} von höchstens ${fmtDur(r.maxSpanMin)}` },
    { ok: maxCont <= r.breakAfterMin, label: "Pause nach 4,5 Std. Lenkzeit", detail: `längster Block ohne Pause: ${fmtDur(maxCont)}` },
  ];

  return { rows, start, end, spanMin, driveMin, breakMin, tripCount: trips.length, lines: [...new Set(trips.map((t) => t.line))], checks };
}

// CSV fuer Excel (Semikolon, UTF-8 mit BOM). Eine Zeile pro Fahrt.
export function rosterCsv(date: string, drivers: Pick<PlanDriver, "name" | "trips">[]): string {
  const head = ["Datum", "Fahrer", "Beginn", "Ende", "Dauer (Min.)", "Linie", "Von", "Nach"];
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = [head.map(esc).join(";")];
  for (const d of drivers) {
    for (const t of [...d.trips].sort((a, b) => a.dep - b.dep)) {
      lines.push([date, d.name, fmtMin(t.dep), fmtMin(t.arr), t.arr - t.dep, t.line, t.from, t.to].map(esc).join(";"));
    }
  }
  return "﻿" + lines.join("\r\n");
}
