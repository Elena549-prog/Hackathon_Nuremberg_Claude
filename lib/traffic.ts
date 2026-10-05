// Stau-Faktor je Linie und Uhrzeit. 1.00 = Fahrplanzeit, 1.20 = 20 % laenger.
// Stufe 1 (jetzt): Simulation = Hauptverkehrszeit plus Zuschlaege je Liniennummer.
// Stufe 2 (spaeter): echte Faktoren aus der Supabase-Ansicht traffic_factors (aufgezeichnete Verspaetungen).

export type TrafficBump = Record<string, number>; // Liniennummer -> Zuschlag, z. B. 0.18

export function rushHourExtra(minute: number): number {
  const h = minute / 60;
  return (h >= 6 && h < 9) || (h >= 15 && h < 18) ? 0.15 : 0;
}

export function trafficFactor(shortName: string, minute: number, bump: TrafficBump): number {
  return 1 + rushHourExtra(minute) + (bump[shortName] ?? 0);
}
