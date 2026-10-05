import { NextResponse } from "next/server";
import { computePlan } from "@/lib/plan-service.ts";
import { loadDrivers } from "@/lib/drivers.ts";
import { loadHistory } from "@/lib/history.ts";
import { fetchLive } from "@/lib/vag-live.ts";
import type { PlanRequest } from "@/lib/api-types.ts";

export const maxDuration = 30;

export async function POST(req: Request) {
  let body: Partial<PlanRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiges JSON" }, { status: 400 });
  }
  const res = await computePlan(body, { getDrivers: loadDrivers, getLive: () => fetchLive(), getHistory: () => loadHistory() });
  return res.ok ? NextResponse.json(res.data) : NextResponse.json({ error: res.error }, { status: res.status });
}
