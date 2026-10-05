// Ausfuehren:  node --test tests/traffic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decay, liveExcess, makeFactor, MAX_EXCESS, rushHourExtra } from "../lib/traffic.ts";
import { aggregate, median, toObservations } from "../lib/vag-live.ts";

const dep = (over: Partial<Parameters<typeof toObservations>[1][0]> = {}) => ({
  Linienname: "36", AbfahrtszeitSoll: "2026-10-05T16:00:00+02:00", AbfahrtszeitIst: "2026-10-05T16:05:00+02:00",
  Produkt: "Bus", Prognose: true, Fahrtnummer: 1, ...over,
});

test("Verspaetung wird in Sekunden umgerechnet", () => {
  const [o] = toObservations("510", [dep()]);
  assert.equal(o.delaySec, 300);
  assert.equal(o.line, "36");
});

test("nur Busse mit Prognose zaehlen, Ausreisser fliegen raus", () => {
  const obs = toObservations("510", [
    dep({ Produkt: "UBahn" }),
    dep({ Prognose: false }),
    dep({ AbfahrtszeitIst: "2026-10-05T18:30:00+02:00" }), // 2,5 Stunden: unplausibel
    dep({ AbfahrtszeitIst: "2026-10-05T15:30:00+02:00" }), // 30 Min. zu frueh: unplausibel
    dep(),
  ]);
  assert.equal(obs.length, 1);
});

test("Median ist robust gegen Ausreisser", () => {
  assert.equal(median([0, 60, 120, 5000]), 90);
  assert.equal(median([10]), 10);
  assert.equal(median([]), 0);
  const lines = aggregate(toObservations("1", [dep(), dep({ AbfahrtszeitIst: "2026-10-05T16:01:00+02:00" }), dep({ Linienname: "E8" })]));
  assert.equal(lines["36"].samples, 2);
  assert.equal(lines["E8"].samples, 1);
});

test("Live-Zuschlag: relativ zur Fahrtdauer, nie negativ, gedeckelt", () => {
  assert.ok(Math.abs(liveExcess(300, 25) - 0.2) < 1e-9); // 5 Min. Verspaetung bei 25 Min. Fahrt
  assert.equal(liveExcess(-120, 25), 0); // zu frueh = keine Verkuerzung
  assert.equal(liveExcess(3600, 25), MAX_EXCESS);
  assert.equal(liveExcess(300, 0), 0);
});

test("Abklingen: voll bei Jetzt, null nach zwei Stunden, vorher nichts", () => {
  assert.equal(decay(600, 600), 1);
  assert.equal(decay(660, 600), 0.5);
  assert.equal(decay(720, 600), 0);
  assert.equal(decay(500, 600), 0);
});

test("Faktor: Grundlast aus Historie schlaegt Simulation, Live addiert sich", () => {
  const history = new Map([["36|3|9", 1.3]]);
  const f = makeFactor({ nowMin: 540, weekday: 3, excess: { "36": 0.2 }, history, bump: {} });
  assert.ok(Math.abs(f("36", 540) - 1.5) < 1e-9); // 1.3 Historie + 0.2 live
  assert.ok(Math.abs(f("36", 600) - 1.1) < 1e-9); // Stunde 10: keine Historie (1.0), Live zur Haelfte abgeklungen (+0.1)
  const sim = makeFactor({ nowMin: 0, weekday: 3, excess: {}, history: new Map(), bump: {} });
  assert.equal(sim("99", 7 * 60), 1 + rushHourExtra(7 * 60));
  assert.equal(sim("99", 12 * 60), 1);
});

test("simulierte Stoerung wirkt additiv", () => {
  const f = makeFactor({ nowMin: 0, weekday: 1, excess: {}, history: new Map(), bump: { "43": 0.2 } });
  assert.ok(Math.abs(f("43", 12 * 60) - 1.2) < 1e-9);
  assert.equal(f("44", 12 * 60), 1);
});
