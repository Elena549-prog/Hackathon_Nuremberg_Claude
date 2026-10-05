// Gelernte Grundlast aus Supabase (nur Server).

import { createClient } from "@supabase/supabase-js";

let histCache: { at: number; map: Map<string, number> } | null = null;

export async function loadHistory(minSamples = 5): Promise<Map<string, number>> {
  if (histCache && Date.now() - histCache.at < 10 * 60_000) return histCache.map;
  const map = new Map<string, number>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await sb.from("traffic_factors").select("line,weekday,hour,samples,factor").gte("samples", minSamples).limit(5000);
      for (const r of (data ?? []) as { line: string; weekday: number; hour: number; factor: number }[]) map.set(`${r.line}|${r.weekday}|${r.hour}`, Number(r.factor));
    } catch {
      /* ohne Historie weiterarbeiten */
    }
  }
  histCache = { at: Date.now(), map };
  return map;
}
