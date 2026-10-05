"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanRequest, PlanResponse } from "@/lib/api-types.ts";
import { filterByLines } from "@/lib/filter.ts";
import { rosterCsv } from "@/lib/roster.ts";
import DriverDrawer from "@/components/DriverDrawer.tsx";

const START = 240; // 04:00
const END = 1560; // 02:00 des Folgetags
const LABEL_W = 96;

const fmtDelay = (s: number) => (Math.abs(s) < 90 ? `${s} s` : `${(s / 60).toFixed(1).replace(".", ",")} Min.`);
const fmtClock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const pct = (m: number) => `${((m - START) / (END - START)) * 100}%`;
// Jede Linie hat ihre eigene Farbe: die ersten sechs aus der validierten Palette, alle weiteren per
// Goldenem Winkel (gut verteilte Farbtoene, Rotbereich ausgespart, da Rot fuer "unbesetzt" reserviert ist).
// Bei sehr vielen Linien ähneln sich manche Farben, deshalb zeigt jeder Balken seine Linie im Tooltip.
const colorOf = (idx: number) => {
  if (idx < 0) return "var(--other)";
  if (idx < 6) return `var(--s${idx})`;
  let h = (idx * 137.508 + 20) % 360;
  if (h > 345 || h < 20) h = (h + 40) % 360;
  return `hsl(${h.toFixed(0)} 58% var(--lum))`;
};
const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2);

const BUCKET = 30; // Minuten je Zelle im Linien-Gantt
const RIGHT_W = 96;

// Gantt je Linie: y = Buslinien, x = Tageszeit. Jede Zelle (30 Min.) zeigt, wie viele der Fahrten besetzt sind.
function LineCoverage({ data, nowMin, onMove, onLeave }: { data: PlanResponse; nowMin: number; onMove: (e: React.MouseEvent) => void; onLeave: () => void }) {
  const rows = useMemo(() => {
    const nb = Math.ceil((END - START) / BUCKET);
    const m = new Map<string, { total: number[]; ok: number[]; gaps: number; trips: number }>();
    const ensure = (l: string) => {
      let r = m.get(l);
      if (!r) { r = { total: Array(nb).fill(0), ok: Array(nb).fill(0), gaps: 0, trips: 0 }; m.set(l, r); }
      return r;
    };
    const bucket = (dep: number) => Math.min(nb - 1, Math.max(0, Math.floor((dep - START) / BUCKET)));
    for (const d of data.drivers) for (const t of d.trips) { const r = ensure(t.line); const b = bucket(t.dep); r.total[b]++; r.ok[b]++; r.trips++; }
    for (const g of data.gaps) { const r = ensure(g.line); const b = bucket(g.dep); r.total[b]++; r.trips++; if (g.dep >= nowMin) r.gaps++; }
    const col = new Map(data.lines.map((l) => [l.line, l.color]));
    return [...m.entries()]
      .map(([line, r]) => ({ line, color: col.get(line) ?? -1, ...r }))
      .sort((a, b) => b.gaps - a.gaps || b.trips - a.trips);
  }, [data, nowMin]);

  const axis: number[] = []; for (let m = START; m <= END; m += 120) axis.push(m);
  const nowLeft = `calc(${LABEL_W}px + (100% - ${LABEL_W + RIGHT_W}px) * ${(nowMin - START) / (END - START)})`;
  const stripes = "repeating-linear-gradient(135deg, var(--bad) 0 3px, var(--bad-soft) 3px 6px)";

  return (
    <section className="block">
      <div className="card">
        <div className="ch"><h2>Abdeckung je Linie</h2><span>Linien mit Lücken zuerst, 30-Minuten-Raster</span></div>
        <div className="cb">
          <div className="gscroll" onMouseMove={onMove} onMouseLeave={onLeave}>
            <div style={{ position: "relative" }}>
              <div className="axis" style={{ marginRight: RIGHT_W }}>{axis.map((m) => <i key={m} style={{ left: pct(m) }}>{fmt(m)}</i>)}</div>
              <div className="now" style={{ left: nowLeft }} />
              {rows.map((r) => (
                <div className="row" key={r.line}>
                  <div className="n"><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: colorOf(r.color), marginRight: 6 }} />Linie {r.line}</div>
                  <div className="track">
                    {r.total.map((n, b) => {
                      if (!n) return null;
                      const from = START + b * BUCKET;
                      const p = Math.round((r.ok[b] / n) * 100);
                      const color = colorOf(r.color);
                      const style: React.CSSProperties = { left: pct(from), width: `${(BUCKET / (END - START)) * 100}%` };
                      if (p === 100) style.background = color;
                      else if (p > 0) style.background = `linear-gradient(to right, ${color} ${p}%, transparent ${p}%), ${stripes}`;
                      return (
                        <div key={b} className={`bar${p === 0 ? " gap" : ""}${from + BUCKET <= nowMin ? " locked" : ""}`} style={style}
                          data-tip={`Linie ${r.line}\n${fmt(from)} bis ${fmt(from + BUCKET)}\n${r.ok[b]} von ${n} Fahrten besetzt`} />
                      );
                    })}
                  </div>
                  <div className="rc"><span className={`chip ${r.gaps ? "bad" : "ok"}`}><u>{r.gaps ? "×" : "✓"}</u>{r.gaps ? `${r.gaps} offen` : "gedeckt"}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="legend">
            <span><b style={{ background: "var(--s0)" }} />voll besetzt (Linienfarbe)</span>
            <span><b style={{ background: "linear-gradient(to right, var(--s0) 50%, var(--bad) 50%)" }} />teilweise besetzt</span>
            <span><b style={{ background: "var(--bad)" }} />ohne Fahrer</span>
            <span>Blass = bereits gefahren, leer = keine Fahrten</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// Filter nach Buslinien: mehrere Linien waehlbar, Suche nach Liniennummer. Wirkt auf alle Bereiche der Seite.
function LineFilter({ lines, sel, onChange }: { lines: PlanResponse["lines"]; sel: Set<string>; onChange: (s: Set<string>) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = (query ? lines.filter((l) => l.line.toLowerCase().includes(query)) : [...lines].sort((a, b) => b.uncovered - a.uncovered || b.trips - a.trips)).slice(0, 14);
  const toggle = (line: string) => { const n = new Set(sel); n.has(line) ? n.delete(line) : n.add(line); onChange(n); };
  const color = new Map(lines.map((l) => [l.line, l.color]));

  return (
    <section className="block" style={{ paddingTop: 16, paddingBottom: 0 }}>
      <div className="card">
        <div className="cb filter">
          <label htmlFor="line-q" style={{ fontWeight: 600 }}>Nach Buslinie filtern</label>
          <input id="line-q" className="ctl" style={{ width: 170 }} placeholder="Liniennummer, z. B. 36" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { toggle(matches[0].line); setQ(""); } }} />
          <span className="fine" style={{ margin: 0 }}>{query ? "Treffer:" : "Linien mit den meisten Lücken:"}</span>
          {matches.map((l) => (
            <button key={l.line} className="fchip" aria-pressed={sel.has(l.line)} onClick={() => toggle(l.line)}>
              <i style={{ background: colorOf(color.get(l.line) ?? -1) }} />{l.line}{l.uncovered > 0 && <span className="mono"> {l.uncovered}</span>}
            </button>
          ))}
          {!matches.length && <span className="empty">Keine Linie gefunden.</span>}
          {sel.size > 0 && (
            <>
              <span className="fine" style={{ margin: 0 }}>Aktiv:</span>
              {[...sel].map((l) => <button key={l} className="fchip" aria-pressed="true" onClick={() => toggle(l)} title="Entfernen">Linie {l} ×</button>)}
              <button className="btn ghost" onClick={() => onChange(new Set())}>Filter zurücksetzen</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

interface Pending { before: Map<string, string>; gaps: Set<string>; hit: string[]; bump: Record<string, number> }

export default function Dashboard() {
  const [date, setDate] = useState("2026-10-08");
  const [nowMin, setNowMin] = useState(360);
  const [poolSize, setPoolSize] = useState(400);
  const [sick, setSick] = useState<Set<string>>(new Set());
  const [bump, setBump] = useState<Record<string, number>>({});
  const [trafficMode, setTrafficMode] = useState<"live" | "simulated">("live");
  const [refresh, setRefresh] = useState(0); // erhoeht sich bei "Heute, jetzt": holt Live-Daten erneut
  const [locked, setLocked] = useState<Record<string, string>>({});
  const [rawData, setData] = useState<PlanResponse | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()); // Linienfilter
  const data = useMemo(() => (rawData ? filterByLines(rawData, sel) : null), [rawData, sel]); // gefilterte Sicht fuer die Anzeige
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selGap, setSelGap] = useState<string | null>(null);
  const [selDriver, setSelDriver] = useState<string | null>(null); // Dienstplan pro Fahrer (Seitenfenster)
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
        const body: PlanRequest = { date, nowMin, poolSize, absent: [...sick], locked, bump, traffic: trafficMode };
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
  }, [date, nowMin, poolSize, sick, bump, locked, trafficMode, refresh]);

  // Nach "Aktualisieren": Aenderungen gegenueber dem vorherigen Plan ins Protokoll schreiben
  useEffect(() => {
    const p = pending.current;
    if (!p || !rawData || loading || rawData.nowMin !== nowMin) return;
    pending.current = null;
    let changed = 0;
    for (const d of rawData.drivers) for (const t of d.trips) if (t.dep >= nowMin && p.before.get(t.id) !== d.id) changed++;
    const newGaps = rawData.gaps.filter((g) => g.dep >= nowMin && !p.gaps.has(g.id)).length;
    const tr = rawData.traffic;
    const lage = tr.used === "live"
      ? `Live-Verkehr (${tr.liveLines} Linien, Stand ${new Date(tr.fetchedAt!).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })})`
      : p.hit.map((l) => `Linie ${l} +${Math.round(p.bump[l] * 100)} %`).join(", ");
    addLog(`Plan aktualisiert: ${lage}. ${changed} Fahrten neu zugeordnet, ${newGaps} neue Lücken.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, loading]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // React Strict Mode ruft Effekte in der Entwicklung doppelt auf
    started.current = true;
    addLog("Tagesplan wird berechnet.", 360);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance() {
    if (!rawData) return;
    const newNow = Math.min(nowMin + 60, 1380);
    const before = new Map<string, string>();
    const nl = { ...locked };
    for (const d of rawData.drivers) for (const t of d.trips) { before.set(t.id, d.id); if (t.dep < newNow) nl[t.id] = d.id; }
    // Live: die Verkehrslage kommt von der VAG. Simuliert: zufaellige Stoerungen auf zwei Linien.
    const nb: Record<string, number> = {};
    let hit: string[] = [];
    if (trafficMode === "simulated") {
      for (const [k, v] of Object.entries(bump)) nb[k] = v * 0.5;
      hit = [...rawData.lines.slice(0, 12)].sort(() => Math.random() - 0.5).slice(0, 2).map((l) => l.line);
      hit.forEach((l) => (nb[l] = 0.08 + Math.random() * 0.22));
    }
    pending.current = { before, gaps: new Set(rawData.gaps.map((g) => g.id)), hit, bump: nb };
    setLocked(nl);
    setBump(nb);
    setNowMin(newNow);
    setRefresh((r) => r + 1);
  }

  // Heutiges Datum und aktuelle Uhrzeit in Nuernberg uebernehmen und Live-Verkehr holen
  function nowBerlin() {
    const [d, t] = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).split(" ");
    const [h, m] = t.split(":").map(Number);
    setDate(d); setNowMin(Math.min(1380, h * 60 + m)); setLocked({}); setSelGap(null);
    setTrafficMode("live"); setRefresh((r) => r + 1);
    addLog("Heutiges Datum und aktuelle Uhrzeit übernommen, Live-Verkehr wird geladen.", h * 60 + m);
  }

  function toggleSick(id: string, name: string, on: boolean) {
    setSick((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
    addLog(`${name} ${on ? "als krank gemeldet" : "wieder verfügbar"}. Plan neu berechnet.`);
  }

  const cov = data?.coverage ?? 0;
  const status = cov >= 95 ? { c: "var(--ok)", g: "✓", t: "im Plan" } : cov >= 85 ? { c: "var(--warn)", g: "!", t: "knapp" } : { c: "var(--bad)", g: "×", t: "kritisch" };
  const lineColor = useMemo(() => new Map((data?.lines ?? []).map((l) => [l.line, l.color])), [data]);
  const gap = data?.gaps.find((g) => g.id === selGap);
  const isLive = data?.traffic.used === "live";
  const listLines = (isLive
    ? [...(data?.lines ?? [])].filter((l) => l.delaySec !== null).sort((a, b) => b.delaySec! - a.delaySec!)
    : data?.lines ?? []
  ).slice(0, 12);
  const axis: number[] = []; for (let m = START; m <= END; m += 120) axis.push(m);
  const nowLeft = `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${(nowMin - START) / (END - START)})`;

  const onMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-tip]") as HTMLElement | null;
    setTip(el ? { x: Math.min(window.innerWidth - 260, e.clientX + 14), y: e.clientY + 16, text: el.dataset.tip! } : null);
  };
  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-g]") as HTMLElement | null;
    if (el) { setSelGap(el.dataset.g!); return; }
    const dr = (e.target as HTMLElement).closest("[data-d]") as HTMLElement | null;
    if (dr) setSelDriver(dr.dataset.d!);
  };

  function downloadAll() {
    if (!rawData) return;
    const blob = new Blob([rosterCsv(rawData.date, rawData.drivers)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dienstplaene_${rawData.date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    addLog(`Alle Dienstpläne als CSV exportiert (${rawData.drivers.length} Fahrer).`);
  }
  const colorByLine = useMemo(() => new Map((rawData?.lines ?? []).map((l) => [l.line, l.color])), [rawData]);

  return (
    <>
      <header className="top">
        <div className="brand"><div className="mark" />Busplaner Nürnberg</div>
        <input className="ctl" type="date" value={date} aria-label="Datum" onChange={(e) => { setDate(e.target.value); setLocked({}); setSelGap(null); }} />
        <button className="btn ghost" onClick={nowBerlin}>Heute, jetzt</button>
        <span className="tabs" role="group" aria-label="Verkehrslage">
          <button aria-pressed={trafficMode === "live"} onClick={() => setTrafficMode("live")}>Live (VAG)</button>
          <button aria-pressed={trafficMode === "simulated"} onClick={() => setTrafficMode("simulated")}>Simuliert</button>
        </span>
        <span className="sp" />
        <span className="stand mono">{loading ? "Berechnet …" : data ? `Stand ${fmt(nowMin)} Uhr, ${data.ms} ms` : ""}</span>
        <button className="btn" onClick={advance} disabled={!data || nowMin >= 1380}>Aktualisieren, +1 Std.</button>
      </header>

      {error && <div className="err">Fehler: {error}</div>}

      <section className="kpis">
        <div className="kpi">
          <div className="l">Deckungsgrad, Rest des Tages{sel.size ? ` (${sel.size} ${sel.size === 1 ? "Linie" : "Linien"} gewählt)` : ""}</div>
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
          <div className="s">{isLive ? `Live (VAG), Stand ${fmtClock(data!.traffic.fetchedAt)}` : "simuliert, Durchschnitt aller Linien"}</div>
        </div>
      </section>

      {rawData && <LineFilter lines={rawData.lines} sel={sel} onChange={setSel} />}

      <main className={`grid${loading ? " loading" : ""}`}>
        <div className="card">
          <div className="ch"><h2>Fahrer</h2><span>Pool anpassen</span></div>
          <div className="cb">
            <div className="pool"><span>Fahrer im Pool</span><b>{poolSize}</b></div>
            <input type="range" min={100} max={400} step={5} value={poolSize} aria-label="Fahrer im Pool" onChange={(e) => setPoolSize(+e.target.value)} />
            <div className="drivers">
              {(data?.roster ?? []).map((d) => (
                <div key={d.id} className={`drow${d.absent ? " sick" : ""}`}>
                  <span className="nm"><span className="av">{initials(d.name)}</span><button className="linkbtn" onClick={() => setSelDriver(d.id)} title="Dienstplan öffnen">{d.name}</button></span>
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
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn ghost" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={downloadAll} disabled={!rawData}>Alle Dienstpläne (CSV)</button>
            <span className="tabs" role="group" aria-label="Ansicht">
              <button aria-pressed={view === "chart"} onClick={() => setView("chart")}>Zeitleiste</button>
              <button aria-pressed={view === "table"} onClick={() => setView("table")}>Tabelle</button>
            </span>
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
                      <div className="n clickable" data-d={d.id} title="Dienstplan öffnen">{d.name}</div>
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
              {(data?.lines ?? []).slice(0, 8).map((l) => <span key={l.line}><b style={{ background: colorOf(l.color) }} />Linie {l.line}</span>)}
              <span>weitere Linien: Farbe im Tooltip und in der Liste rechts</span>
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
          <div className="ch"><h2>Linien und Verkehr</h2><span>{isLive ? "größte Verspätung" : "größte 12"}</span></div>
          <div className="cb">
            <p className="fine">
              {data?.traffic.used === "live"
                ? `Live-Verspätungen der VAG (Median je Linie, Stand ${fmtClock(data.traffic.fetchedAt)}). Sie wirken ab „Jetzt“ und klingen über 2 Stunden auf den Normalwert ab.`
                : "Stau-Zuschläge sind simuliert (Hauptverkehrszeit plus zufällige Störungen bei jeder Aktualisierung)."}
              {data?.traffic.note ? ` ${data.traffic.note}` : ""} Die OpenStreetMap-Karte folgt.
            </p>
            <div className="lines">
              {listLines.map((l) => (
                <div className="rrow" key={l.line}>
                  <span className="nm"><i style={{ background: colorOf(l.color) }} />Linie {l.line}</span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {l.delaySec !== null && <span className="mono" style={{ color: "var(--faint)", fontSize: 12 }} title="Aktuelle Verspätung (Median)">{fmtDelay(l.delaySec)}</span>}
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

      {data && <LineCoverage data={data} nowMin={nowMin} onMove={onMove} onLeave={() => setTip(null)} />}

      <section className="log">
        <div className="card"><div className="ch"><h2>Änderungsprotokoll</h2></div>
          <div className="cb">{log.map((e, i) => <div className="e" key={i}><span>{fmt(e.t)}</span><span>{e.msg}</span></div>)}</div>
        </div>
      </section>

      {rawData && selDriver && (
        <DriverDrawer
          driver={rawData.drivers.find((d) => d.id === selDriver) ?? null}
          name={rawData.roster.find((r) => r.id === selDriver)?.name ?? rawData.drivers.find((d) => d.id === selDriver)?.name ?? ""}
          date={rawData.date}
          nowMin={nowMin}
          absent={rawData.roster.find((r) => r.id === selDriver)?.absent ?? false}
          lineColor={(l) => colorOf(colorByLine.get(l) ?? -1)}
          onClose={() => setSelDriver(null)}
          onToggleSick={(on) => { const r = rawData.roster.find((x) => x.id === selDriver); if (r) toggleSick(r.id, r.name, on); }}
        />
      )}

      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text.split("\n").map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <div key={i}>{l}</div>))}
        </div>
      )}
    </>
  );
}
