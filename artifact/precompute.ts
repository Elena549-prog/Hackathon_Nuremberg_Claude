// Wird beim Bauen in Node ausgefuehrt: berechnet den Startplan und gibt ihn als JSON aus.
import { computePlan } from "../lib/plan-service.ts";
import { browserDeps, DEFAULT_REQUEST } from "./deps.ts";

const res = await computePlan(DEFAULT_REQUEST, browserDeps);
if (!res.ok) throw new Error(res.error);
process.stdout.write(JSON.stringify(res.data));
