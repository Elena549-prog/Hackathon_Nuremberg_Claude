"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlanDriver } from "@/lib/api-types.ts";
import { buildRoster, fmtDur, fmtMin, rosterCsv } from "@/lib/roster.ts";
import { IS_ARTIFACT, copyText } from "@/lib/env.ts";

interface Props {
  driver: PlanDriver | null; // null = Fahrer hat an diesem Tag keine Fahrt
  name: string;
  date: string;
  nowMin: number;
  absent: boolean;
  lineColor: (line: string) => string;
  onClose: () => void;
  onToggleSick: (on: boolean) => void;
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export default function DriverDrawer({ driver, name, date, nowMin, absent, lineColor, onClose, onToggleSick }: Props) {
  const [copied, setCopied] = useState(false);
  const roster = useMemo(() => buildRoster(driver ?? { trips: [] }), [driver]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyCsv() {
    const ok = await copyText(rosterCsv(date, [{ name, trips: driver?.trips ?? [] }]).replace("\ufeff", ""));
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([rosterCsv(date, [{ name, trips: driver?.trips ?? [] }])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dienstplan_${name.replaceAll(" ", "_")}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Dienstplan ${name}`}>
        <div className="dh">
          <div>
            <div className="dt">Dienstplan</div>
            <h2>{name}</h2>
            <div className="muted-s">{weekday(date)}</div>
          </div>
          <button className="btn ghost no-print" onClick={onClose} aria-label="Schließen">Schließen</button>
        </div>

        {absent && <div className="notice">Als abwesend gemeldet, es werden keine Fahrten geplant.</div>}

        {!roster.tripCount && !absent && <p className="empty">Für diesen Tag sind dem Fahrer keine Fahrten zugeteilt.</p>}

        {roster.tripCount > 0 && (
          <>
            <div className="dsum">
              <div><span>Schicht</span><b className="mono">{fmtMin(roster.start!)} bis {fmtMin(roster.end!)}</b></div>
              <div><span>Dauer</span><b>{fmtDur(roster.spanMin)}</b></div>
              <div><span>Lenkzeit</span><b>{fmtDur(roster.driveMin)}</b></div>
              <div><span>Pausen</span><b>{roster.breakMin ? fmtDur(roster.breakMin) : "keine"}</b></div>
              <div><span>Fahrten</span><b>{roster.tripCount}</b></div>
              <div><span>Linien</span><b>{roster.lines.join(", ")}</b></div>
            </div>

            <ul className="checks">
              {roster.checks.map((c) => (
                <li key={c.label}>
                  <u style={{ background: c.ok ? "var(--ok)" : "var(--bad)", color: c.ok ? "#0b0b0b" : "#fff" }}>{c.ok ? "✓" : "×"}</u>
                  <span><b>{c.label}</b> {c.detail}</span>
                </li>
              ))}
            </ul>

            <table className="tv roster">
              <thead><tr><th>Zeit</th><th>Linie</th><th>Strecke</th><th className="num">Min.</th></tr></thead>
              <tbody>
                {roster.rows.map((r, i) =>
                  r.kind === "gap" ? (
                    <tr key={i} className={`gaprow-r${r.label === "Pause" ? " brk" : ""}`}>
                      <td className="mono">{fmtMin(r.from)}</td>
                      <td colSpan={2}>{r.label}</td>
                      <td className="num">{r.min}</td>
                    </tr>
                  ) : (
                    <tr key={r.trip.id} className={r.trip.dep < nowMin ? "past" : ""}>
                      <td className="mono">{fmtMin(r.trip.dep)}</td>
                      <td><span className="ldot" style={{ background: lineColor(r.trip.line) }} />{r.trip.line}</td>
                      <td>{r.trip.from} nach {r.trip.to}</td>
                      <td className="num">{r.trip.arr - r.trip.dep}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="dactions no-print">
          {IS_ARTIFACT ? (
            <button className="btn" onClick={copyCsv} disabled={!roster.tripCount}>{copied ? "Kopiert" : "Tabelle kopieren"}</button>
          ) : (
            <>
              <button className="btn" onClick={download} disabled={!roster.tripCount}>CSV herunterladen</button>
              <button className="btn ghost" onClick={() => window.print()} disabled={!roster.tripCount}>Drucken oder als PDF</button>
            </>
          )}
          <button className="btn ghost" onClick={() => onToggleSick(!absent)}>{absent ? "Wieder verfügbar" : "Krank melden"}</button>
        </div>
      </aside>
    </>
  );
}
