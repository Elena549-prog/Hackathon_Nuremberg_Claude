"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanRequest, PlanResponse } from "@/lib/api-types.ts";

const START = 240; // 04:00
const END = 1560; // 02:00 des Folgetags
const LABEL_W = 96;

const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const pct = (m: number) => `${((m - START) / (END - START)) * 100}%`;
const colorOf = (idx: number) => (idx >= 0 ? `var(--s${idx})` : "var(--other)");
const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2);

interface Pending { before: Map<string, string>; gaps: Set<string>; hit: string[]; bump: Record<string, number> }

export default function Dashboard() {
  const [date, setDate] = useState("2026-10-08");
  const [nowMin, setNowMin] = useState(360);
  const [poolSize, setPoolSize] = useState(400);
  const [sick, setSick] = useState<Set<string>>(new Set());
  const [bump, setBump] = useState<Record<string, number>>({});
  const [locked, setLocked] = useState<Record<string, string>>({});
  const [data, setData] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selGap, setSelGap] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [log, setLog] = useState<{ t: number; msg: string }[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const pending = useRef<Pending | null>(null);

  const addLog = (msg: string, t = nowMin) => setLog((l) => [{ t, msg }, ...l]);

  // Plan vom Server holen, sobald sich eine Eingabe aendert (mit kurzer Verzoegerung)
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const body: PlanRequest = { date, nowMin, poolSize, absent: [...sick], locked, bump };
        const r = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setData(j as PlanResponse);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [date, nowMin, poolSize, sick, bump, locked]);

  // Nach "Aktualisieren": Aenderungen gegenueber dem vorherigen Plan ins Protokoll schreiben
  useEffect(() => {
    const p = pending.current;
    if (!p || !data || loading || data.nowMin !== nowMin) return;
    pending.current = null;
    let changed = 0;
    for (const d of data.drivers) for (const t of d.trips) if (t.dep >= nowMin && p.before.get(t.id) !== d.id) changed++;
    const newGaps = data.gaps.filter((g) => g.dep >= nowMin && !p.gaps.has(g.id)).length;
    addLog(`Plan aktualisiert: ${p.hit.map((l) => `Linie ${l} +${Math.round(p.bump[l] * 100)} %`).join(", ")}. ${changed} Fahrten neu zugeordnet, ${newGaps} neue Lücken.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading]);

  useEffect(() => { addLog("Tagesplan wird berechnet.", 360); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function advance() {
    if (!data) return;
    const newNow = Math.min(nowMin + 60, 1380);
    const before = new Map<string, string>();
    const nl = { ...locked };
    for (const d of data.drivers) for (const t of d.trips) { before.set(t.id, d.id); if (t.dep < newNow) nl[t.id] = d.id; }
    const nb: Record<string, number> = {};
    for (const [k, v] of Object.entries(bump)) nb[k] = v * 0.5;
    const hit = [...data.lines.slice(0, 12)].sort(() => Math.random() - 0.5).slice(0, 2).map((l) => l.line);
    hit.forEach((l) => (nb[l] = 0.08 + Math.random() * 0.22));
    pending.current = { before, gaps: new Set(data.gaps.map((g) => g.id)), hit, bump: nb };
    setLocked(nl);
    setBump(nb);
    setNowMin(newNow);
  }

  function toggleSick(id: string, name: string, on: boolean) {
    setSick((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
    addLog(`${name} ${on ? "als krank gemeldet" : "wieder verfügbar"}. Plan neu berechnet.`);
  }

  const cov = data?.coverage ?? 0;
  const status = cov >= 95 ? { c: "var(--ok)", g: "✓", t: "im Plan" } : cov >= 85 ? { c: "var(--warn)", g: "!", t: "knapp" } : { c: "var(--bad)", g: "×", t: "kritisch" };
  const lineColor = useMemo(() => new Map((data?.lines ?? []).map((l) => [l.line, l.color])), [data]);
  const gap = data?.gaps.find((g) => g.id === selGap);
  const axis: number[] = []; for (let m = START; m <= END; m += 120) axis.push(m);
  const nowLeft = `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${(nowMin - START) / (END - START)})`;

  const onMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-tip]") as HTMLElement | null;
    setTip(el ? { x: Math.min(window.innerWidth - 260, e.clientX + 14), y: e.clientY + 16, text: el.dataset.tip! } : null);
  };
  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-g]") as HTMLElement | null;
    if (el) setSelGap(el.dataset.g!);
  };

  return (
    <>
      <header className="top">
        <div className="brand"><div className="mark" />Busplaner Nürnberg</div>
        <input className="ctl" type="date" value={date} aria-label="Datum" onChange={(e) => { setDate(e.target.value); setLocked({}); setSelGap(null); }} />
        <span className="sp" />
        <span className="stand mono">{loading ? "Berechnet …" : data ? `Stand ${fmt(nowMin)} Uhr, ${data.ms} ms` : ""}</span>
        <button className="btn" onClick={advance} disabled={!data || nowMin >= 1380}>Aktualisieren, +1 Std.</button>
      </header>

      {error && <div className="err">Fehler: {error}</div>}

      <section className="kpis">
        <div className="kpi">
          <div className="l">Deckungsgrad, Rest des Tages</div>
          <div className="v">{data ? `${cov} %` : "-"}</div>
          <div className="bar-cov" style={{ color: status.c }}><i style={{ width: `${cov}%` }} /></div>
          <div className="st"><u style={{ background: status.c }}>{status.g}</u>{status.t}</div>
        </div>
        <div className="kpi">
          <div className="l">Unbesetzte Fahrten</div>
          <div className="v">{data ? data.stats.uncoveredFuture : "-"}</div>
          <div className="s">{data ? `von ${data.stats.future} Fahrten` : ""}</div>
        </div>
        <div className="kpi">
          <div className="l">Fahrer verfügbar</div>
          <div className="v">{data ? `${data.roster.filter((r) => !r.absent).length} / ${data.roster.length}` : "-"}</div>
          <div className="s">{data ? `${data.stats.driversUsed} im Einsatz${sick.size ? `, ${sick.size} abwesend` : ""}` : ""}</div>
        </div>
        <div className="kpi">
          <div className="l">Stau-Zuschlag, jetzt</div>
          <div className="v">{data ? `+${Math.round((data.stats.avgFactor - 1) * 100)} %` : "-"}</div>
          <div className="s">Durchschnitt aller Linien</div>
        </div>
      </section>

      <main className={`grid${loading ? " loading" : ""}`}>
        <div className="card">
          <div className="ch"><h2>Fahrer</h2><span>Pool anpassen</span></div>
          <div className="cb">
            <div className="pool"><span>Fahrer im Pool</span><b>{poolSize}</b></div>
            <input type="range" min={100} max={400} step={5} value={poolSize} aria-label="Fahrer im Pool" onChange={(e) => setPoolSize(+e.target.value)} />
            <div className="drivers">
              {(data?.roster ?? []).map((d) => (
                <div key={d.id} className={`drow${d.absent ? " sick" : ""}`}>
                  <span className="nm"><span className="av">{initials(d.name)}</span><span>{d.name}</span></span>
                  <label className="sw" title="krank"><input type="checkbox" checked={d.absent} aria-label={`${d.name} krank`} onChange={(e) => toggleSick(d.id, d.name, e.target.checked)} /><i /></label>
                </div>
              ))}
              {!data && <div className="empty">Lädt …</div>}
            </div>
            <div className="hint">Schalter rot = krank oder abwesend</div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <h2>Dienstplan <span className="mono" style={{ fontWeight: 400, marginLeft: 6 }}>{data?.date}</span></h2>
            <span className="tabs" role="group" aria-label="Ansicht">
              <button aria-pressed={view === "chart"} onClick={() => setView("chart")}>Zeitleiste</button>
              <button aria-pressed={view === "table"} onClick={() => setView("table")}>Tabelle</button>
            </span>
          </div>
          <div className="cb">
            {data && view === "chart" && (
              <div className="gscroll" onMouseMove={onMove} onMouseLeave={() => setTip(null)} onClick={onClick}>
                <div style={{ position: "relative" }}>
                  <div className="axis">{axis.map((m) => <i key={m} style={{ left: pct(m) }}>{fmt(m)}</i>)}</div>
                  <div className="now" style={{ left: nowLeft }} />
                  {data.drivers.map((d) => (
                    <div className="row" key={d.id}>
                      <div className="n">{d.name}</div>
                      <div className="track">
                        {d.trips.map((t) => (
                          <div key={t.id} className={`bar${t.locked || t.dep < nowMin ? " locked" : ""}`}
                            style={{ left: pct(t.dep), width: `${((t.arr - t.dep) / (END - START)) * 100}%`, background: colorOf(lineColor.get(t.line) ?? -1) }}
                            data-tip={`Linie ${t.line}\n${fmt(t.dep)} bis ${fmt(t.arr)}, ${t.arr - t.dep} Min.\n${d.name}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="row gaprow">
                    <div className="n">Unbesetzt</div>
                    <div className="track" style={{ background: "transparent" }}>
                      {data.gaps.map((g) => (
                        <div key={g.id} data-g={g.id} className={`bar gap${selGap === g.id ? " sel" : ""}`}
                          style={{ left: pct(g.dep), width: `${((g.arr - g.dep) / (END - START)) * 100}%` }}
                          data-tip={`Linie ${g.line}, unbesetzt\n${fmt(g.dep)} bis ${fmt(g.arr)}\nKlicken für Details`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {data && view === "table" && (
              <div className="gscroll">
                <table className="tv">
                  <thead><tr><th>Fahrer</th><th className="num">Fahrten</th><th className="num">Lenkzeit</th><th>Linien</th><th>Schicht</th></tr></thead>
                  <tbody>
                    {data.drivers.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td><td className="num">{d.trips.length}</td>
                        <td className="num">{(d.driveMin / 60).toFixed(1).replace(".", ",")} h</td>
                        <td>{[...new Set(d.trips.map((t) => t.line))].slice(0, 5).join(", ")}</td>
                        <td className="mono">{fmt(d.trips[0].dep)} bis {fmt(d.trips[d.trips.length - 1].arr)}</td>
                      </tr>
                    ))}
                    <tr><td><b>Unbesetzt</b></td><td className="num"><b>{data.gaps.length}</b></td><td className="num">{(data.gaps.reduce((s, g) => s + g.arr - g.dep, 0) / 60).toFixed(1).replace(".", ",")} h</td><td>{[...new Set(data.gaps.map((g) => g.line))].slice(0, 5).join(", ")}</td><td /></tr>
                  </tbody>
                </table>
              </div>
            )}
            {!data && <div className="empty">Plan wird berechnet …</div>}
            <div className="legend">
              {(data?.lines ?? []).slice(0, 6).map((l) => <span key={l.line}><b style={{ background: colorOf(l.color) }} />Linie {l.line}</span>)}
              <span><b style={{ background: "var(--other)" }} />sonstige Linien</span>
              <span><b style={{ background: "var(--bad)" }} />unbesetzt</span>
              <span>Blass = bereits gefahren</span>
            </div>
            <div className="detail">
              {gap ? (
                <>
                  <div className="t">Linie {gap.line} nach {gap.head}, {fmt(gap.dep)} bis {fmt(gap.arr)} ist unbesetzt</div>
                  <ul>
                    <li><b>{gap.reason.limit}</b>Fahrer an der Lenk- oder Schichtgrenze</li>
                    <li><b>{gap.reason.pause}</b>Fahrer brauchen zuerst 45 Min. Pause</li>
                    <li><b>{gap.reason.busy}</b>Fahrer gerade im Einsatz oder zu weit entfernt</li>
                  </ul>
                </>
              ) : <span className="empty">Klicke auf eine rot gestreifte Lücke, um den Grund zu sehen.</span>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><h2>Linien und Verkehr</h2><span>größte 12</span></div>
          <div className="cb">
            <p className="fine">Die OpenStreetMap-Karte folgt. Stau-Zuschläge sind simuliert (Hauptverkehrszeit plus zufällige Störungen bei jeder Aktualisierung).</p>
            <div className="lines">
              {(data?.lines ?? []).slice(0, 12).map((l) => (
                <div className="rrow" key={l.line}>
                  <span className="nm"><i style={{ background: colorOf(l.color) }} />Linie {l.line}</span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>+{Math.round((l.factor - 1) * 100)} %</span>
                    <span className={`chip ${l.uncovered ? "bad" : "ok"}`}><u>{l.uncovered ? "×" : "✓"}</u>{l.uncovered ? `${l.uncovered} offen` : "gedeckt"}</span>
                  </span>
                </div>
              ))}
            </div>
            {data?.source === "synthetic" && <p className="fine" style={{ marginTop: 12 }}>Fahrer: Beispieldaten (Supabase-Schlüssel nicht gesetzt).</p>}
          </div>
        </div>
      </main>

      <section className="log">
        <div className="card"><div className="ch"><h2>Änderungsprotokoll</h2></div>
          <div className="cb">{log.map((e, i) => <div className="e" key={i}><span>{fmt(e.t)}</span><span>{e.msg}</span></div>)}</div>
        </div>
      </section>

      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text.split("\n").map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <div key={i}>{l}</div>))}
        </div>
      )}
    </>
  );
}
