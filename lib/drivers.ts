// Fahrer laden. Mit Supabase-Zugang aus der Datenbank (Funktion available_drivers),
// sonst Fallback auf erzeugte Beispielfahrer, damit die App sofort laeuft.

import { createClient } from "@supabase/supabase-js";
import type { Driver } from "./types.ts";

const FIRST = ["Anna", "Ben", "Cem", "Dana", "Emil", "Farah", "Georg", "Hana", "Ivo", "Jana", "Karl", "Lea", "Murat", "Nina", "Omar", "Petra", "Quirin", "Rosa", "Sven", "Tina", "Uwe", "Vera", "Willi", "Xenia", "Yusuf", "Zora", "Anton", "Bea", "Claus", "Dilek", "Elif", "Felix", "Gabi", "Hakan", "Irina", "Jonas", "Katja", "Lukas", "Mira", "Niko"];
const LAST = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Köhler", "Yilmaz", "Kaya", "Demir", "Öztürk", "Nowak", "Kowalski", "Popescu", "Horvat", "Haas", "Ernst"];

export function syntheticDrivers(n: number): Driver[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `S${String(i + 1).padStart(4, "0")}`,
    name: `${FIRST[i % 40]} ${LAST[((i % 40) * 3 + Math.floor(i / 40)) % 40]}`,
    personnelNo: `P${String(i + 1).padStart(4, "0")}`,
    active: true,
    maxDriveMin: 540,
  }));
}

export async function loadDrivers(date: string): Promise<{ drivers: Driver[]; source: "supabase" | "synthetic" }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { drivers: syntheticDrivers(400), source: "synthetic" };

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("available_drivers", { d: date });
  if (error) throw new Error(`Supabase: ${error.message}`);
  const drivers: Driver[] = (data as { id: string; name: string; personnel_no: string | null; active: boolean; max_drive_min: number }[])
    .map((r) => ({ id: r.id, name: r.name, personnelNo: r.personnel_no ?? undefined, active: r.active, maxDriveMin: r.max_drive_min }))
    .sort((a, b) => (a.personnelNo ?? "").localeCompare(b.personnelNo ?? ""));
  return { drivers, source: "supabase" };
}
