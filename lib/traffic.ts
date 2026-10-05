// Stau-Faktor je Linie und Uhrzeit. 1.00 = Fahrplanzeit, 1.20 = 20 % laenger.
//
// Zusammensetzung (von unten nach oben):
//   1. Grundlast: gelernter Wert aus der Datenbank (Ansicht traffic_factors, je Linie/Wochentag/Stunde),
//      sonst Simulation (Hauptverkehrszeit +15 %).
//   2. Live-Zuschlag: aktuelle Verspaetung der Linie laut VAG, relativ zur typischen Fahrtdauer.
//      Gilt ab "Jetzt" und klingt ueber zwei Stunden auf die Grundlast ab.
//   3. Simulierte Stoerung (nur im Modus "simuliert", fuer Demos).

export type TrafficMode = "live" | "simulated";
export type TrafficBump = Record<string, number>; // Liniennummer -> Zuschlag, z. B. 0.18

export const LIVE_DECAY_MIN = 120; // so lange wirkt die aktuelle Lage nach
export const LIVE_MIN_SAMPLES = 3; // so viele Beobachtungen braucht eine Linie fuer einen Live-Wert
export const MAX_EXCESS = 0.5; // hoechstens +50 % durch Live-Verspaetung

export function rushHourExtra(minute: number): number {
  const h = minute / 60;
  return (h >= 6 && h < 9) || (h >= 15 && h < 18) ? 0.15 : 0;
}

// Verspaetung (Sekunden) in einen Zuschlag auf die Fahrzeit umrechnen. Fruehe Busse verkuerzen nichts.
export function liveExcess(medianDelaySec: number, avgTripMin: number): number {
  if (avgTripMin <= 0) return 0;
  return Math.min(MAX_EXCESS, Math.max(0, medianDelaySec / 60 / avgTripMin));
}

// 1 direkt bei "Jetzt", 0 nach LIVE_DECAY_MIN; vor "Jetzt" kein Einfluss
export function decay(minute: number, nowMin: number): number {
  if (minute < nowMin) return 0;
  return Math.max(0, 1 - (minute - nowMin) / LIVE_DECAY_MIN);
}

export interface FactorInputs {
  nowMin: number;
  weekday: number; // 1 = Montag
  excess: Record<string, number>; // Live-Zuschlag je Liniennummer
  history: Map<string, number>; // "linie|wochentag|stunde" -> Faktor
  bump: TrafficBump;
}

export function makeFactor(inp: FactorInputs): (line: string, minute: number) => number {
  return (line, minute) => {
    const hour = Math.floor(minute / 60) % 24;
    const base = inp.history.get(`${line}|${inp.weekday}|${hour}`) ?? 1 + rushHourExtra(minute);
    return base + (inp.excess[line] ?? 0) * decay(minute, inp.nowMin) + (inp.bump[line] ?? 0);
  };
}
