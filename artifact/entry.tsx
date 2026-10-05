// Einstieg der eigenstaendigen Browser-Version: gleiche Oberflaeche, aber der Plan wird direkt im Browser berechnet.
import { createRoot } from "react-dom/client";
import Dashboard from "../components/Dashboard.tsx";
import { computePlan } from "../lib/plan-service.ts";
import type { PlanRequest, PlanResponse } from "../lib/api-types.ts";
import { browserDeps, DEFAULT_REQUEST } from "./deps.ts";

const initial = JSON.parse(document.getElementById("initial-plan")!.textContent ?? "null") as PlanResponse | null;

const isDefault = (b: Partial<PlanRequest>) =>
  b.date === DEFAULT_REQUEST.date && b.nowMin === DEFAULT_REQUEST.nowMin && b.poolSize === DEFAULT_REQUEST.poolSize &&
  (b.absent?.length ?? 0) === 0 && Object.keys(b.locked ?? {}).length === 0 && Object.keys(b.bump ?? {}).length === 0 && b.traffic === "simulated";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Die Oberflaeche ruft /api/plan auf. Hier gibt es keinen Server, also antwortet der Browser selbst.
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.endsWith("/api/plan")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}")) as Partial<PlanRequest>;
  if (initial && isDefault(body)) return json(initial);
  await new Promise((r) => setTimeout(r, 30)); // der Oberflaeche Zeit geben, "Berechnet ..." zu zeigen
  const res = await computePlan(body, browserDeps);
  return res.ok ? json(res.data) : json({ error: res.error }, res.status);
};

createRoot(document.getElementById("root")!).render(<Dashboard />);
