// Ausfuehren:  node --test tests/roster.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoster, fmtDur, fmtMin, rosterCsv } from "../lib/roster.ts";
import type { PlanTrip } from "../lib/api-types.ts";

const trip = (id: string, dep: number, arr: number, line = "36"): PlanTrip => ({ id, line, dep, arr, locked: false, from: "Plärrer", to: "Flughafen" });

test("Zeitformate", () => {
  assert.equal(fmtMin(305), "05:05");
  assert.equal(fmtMin(1500), "01:00"); // nach Mitternacht
  assert.equal(fmtDur(125), "2 Std. 05 Min.");
});

test("Wende-, Warte- und Pausenzeiten werden unterschieden", () => {
  const r = buildRoster({ trips: [trip("a", 300, 330), trip("b", 335, 365), trip("c", 385, 415), trip("d", 470, 500)] });
  const gaps = r.rows.filter((x) => x.kind === "gap").map((x) => x.kind === "gap" && x.label);
  assert.deepEqual(gaps, ["Wendezeit", "Wartezeit", "Pause"]); // 5 Min., 20 Min., 55 Min.
  assert.equal(r.breakMin, 55);
  assert.equal(r.tripCount, 4);
  assert.equal(r.driveMin, 120);
  assert.equal(r.start, 300);
  assert.equal(r.end, 500);
  assert.equal(r.spanMin, 200);
});

test("Regelpruefung erkennt Verstoesse", () => {
  // 6 Stunden ohne Pause am Stueck: Verstoss gegen die Pausenregel (4,5 Std.)
  const noBreak = buildRoster({ trips: Array.from({ length: 12 }, (_, i) => trip(String(i), 300 + i * 35, 300 + i * 35 + 30)) });
  assert.equal(noBreak.checks.find((c) => c.label.startsWith("Pause"))!.ok, false);
  assert.equal(noBreak.checks.find((c) => c.label === "Lenkzeit")!.ok, true);

  // Pause nach 4 Stunden: in Ordnung
  const ok = buildRoster({ trips: [trip("a", 300, 540), trip("b", 590, 700)] });
  assert.ok(ok.checks.every((c) => c.ok));
});

test("leerer Dienstplan ist unproblematisch", () => {
  const r = buildRoster({ trips: [] });
  assert.equal(r.tripCount, 0);
  assert.equal(r.start, null);
  assert.ok(r.checks.every((c) => c.ok));
});

test("CSV: Semikolon, UTF-8-BOM, eine Zeile pro Fahrt, Anfuehrungszeichen maskiert", () => {
  const csv = rosterCsv("2026-10-08", [{ name: 'Anna "A." Müller', trips: [trip("b", 400, 430), trip("a", 300, 330)] }]);
  const lines = csv.split("\r\n");
  assert.ok(csv.startsWith("﻿"));
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('"Fahrer"'));
  assert.ok(lines[1].includes('"05:00"')); // nach Zeit sortiert
  assert.ok(lines[1].includes('"Anna ""A."" Müller"'));
  assert.ok(lines[1].split(";").length === 8);
});
