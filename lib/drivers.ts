// Fahrer laden. Mit Supabase-Zugang aus der Datenbank (Funktion available_drivers),
// sonst Fallback auf erzeugte Beispielfahrer, damit die App sofort laeuft.

import { createClient } from "@supabase/supabase-js";
import type { Driver } from "./types.ts";

export { syntheticDrivers } from "./synthetic-drivers.ts";
import { syntheticDrivers } from "./synthetic-drivers.ts";

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
