// Live-Verspaetungen der VAG Nuernberg (PULS-Schnittstelle, ohne Schluessel).
// Quelle: https://start.vag.de/dm/api/v1/abfahrten/VGN/{Station}  (opendata.vag.de)
//
// 18 Stationen decken alle Nuernberger Buslinien ab (per Mengenueberdeckung aus den Haltefolgen berechnet).
// Ein Abruf aller Stationen dauert ca. 1,3 Sekunden. Ergebnisse werden 60 Sekunden zwischengespeichert.

export const VAG_STATIONS = ["510", "1970", "1567", "1335", "1160", "152", "1283", "444", "1953", "704", "275", "561", "1560", "1360", "1375", "1468", "1772", "1950"];

export interface LiveObservation { line: string; station: string; tripNo: string; delaySec: number }
export interface LiveLine { line: string; samples: number; medianDelaySec: number; maxDelaySec: number }
export interface LiveSnapshot {
  fetchedAt: string;
  stationsOk: number;
  stationsTotal: number;
  lines: Record<string, LiveLine>;
  observations: LiveObservation[];
}

interface RawDeparture { Linienname: string; AbfahrtszeitSoll: string; AbfahrtszeitIst: string; Produkt: string; Prognose: boolean; Fahrtnummer: number }

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Reine Funktion (testbar): Abfahrten einer Station in Beobachtungen umwandeln
export function toObservations(station: string, deps: RawDeparture[]): LiveObservation[] {
  const out: LiveObservation[] = [];
  for (const d of deps) {
    if (d.Produkt !== "Bus" || !d.Prognose) continue; // nur Busse mit echter Prognose
    const delay = (Date.parse(d.AbfahrtszeitIst) - Date.parse(d.AbfahrtszeitSoll)) / 1000;
    if (!Number.isFinite(delay) || delay < -600 || delay > 3600) continue; // Ausreisser verwerfen
    out.push({ line: d.Linienname, station, tripNo: String(d.Fahrtnummer), delaySec: delay });
  }
  return out;
}

export function aggregate(observations: LiveObservation[]): Record<string, LiveLine> {
  const by = new Map<string, number[]>();
  for (const o of observations) by.set(o.line, [...(by.get(o.line) ?? []), o.delaySec]);
  const lines: Record<string, LiveLine> = {};
  for (const [line, v] of by) lines[line] = { line, samples: v.length, medianDelaySec: Math.round(median(v)), maxDelaySec: Math.round(Math.max(...v)) };
  return lines;
}

let cache: { at: number; snap: LiveSnapshot } | null = null;
const TTL_MS = 60_000;

export async function fetchLive(force = false): Promise<LiveSnapshot> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.snap;

  const results = await Promise.all(
    VAG_STATIONS.map(async (st) => {
      try {
        const r = await fetch(`https://start.vag.de/dm/api/v1/abfahrten/VGN/${st}?timespan=60&limitcount=200`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (!r.ok) return null;
        const j = (await r.json()) as { Abfahrten?: RawDeparture[] };
        return toObservations(st, j.Abfahrten ?? []);
      } catch {
        return null;
      }
    }),
  );
  const ok = results.filter((r): r is LiveObservation[] => r !== null);
  const observations = ok.flat();
  const snap: LiveSnapshot = { fetchedAt: new Date().toISOString(), stationsOk: ok.length, stationsTotal: VAG_STATIONS.length, lines: aggregate(observations), observations };
  if (ok.length) cache = { at: Date.now(), snap };
  return snap;
}
