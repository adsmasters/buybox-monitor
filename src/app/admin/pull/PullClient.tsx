"use client";
import { useState } from "react";

interface Customer { id: string; name: string }
interface PullLog  { id: number; customer_id: string; status: string; asins_total: number; asins_done: number; error_msg: string | null; started_at: string; finished_at: string | null }

interface Props { customers: Customer[]; logs: PullLog[] }

function fmtDT(ts: string) {
  return new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function PullClient({ customers, logs: initLogs }: Props) {
  const [selected, setSelected] = useState<string>("all");
  const [logs, setLogs]         = useState(initLogs);
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState("");

  async function startPull() {
    setRunning(true);
    setProgress("Starte Pull …");
    try {
      const res = await fetch("/api/admin/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: selected === "all" ? null : selected }),
      });
      const data = await res.json();
      if (data.error) { setProgress("Fehler: " + data.error); }
      else { setProgress(`✅ Fertig! ${data.asins_done} ASINs verarbeitet.`); }

      // Logs neu laden
      const logsRes = await fetch("/api/admin/pull/logs");
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (e: any) {
      setProgress("Fehler: " + e.message);
    }
    setRunning(false);
  }

  const statusBadge = (s: string) => {
    if (s === "done")    return "bg-emerald-50 text-emerald-700";
    if (s === "error")   return "bg-red-50 text-red-700";
    if (s === "running") return "bg-blue-50 text-blue-700";
    return "bg-gray-100 text-gray-500";
  };
  const statusLabel = (s: string) => ({ done: "Fertig", error: "Fehler", running: "Läuft …" }[s] ?? s);
  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? id;

  return (
    <main className="max-w-4xl mx-auto px-6 py-7 space-y-8">

      {/* ── Pull starten ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-bold text-gray-900">Keepa-Daten holen</h2>
        <p className="text-sm text-gray-500">Zieht Buy-Box- und Preis-Historie (90 Tage) via Keepa API für alle ASINs des gewählten Kunden.</p>

        <div className="flex gap-3 items-center">
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
            <option value="all">Alle Kunden</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={startPull} disabled={running}
            className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {running ? "Läuft …" : "Pull starten"}
          </button>
        </div>

        {progress && (
          <div className={`text-sm px-4 py-2 rounded-lg font-medium ${progress.startsWith("Fehler") ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>
            {progress}
          </div>
        )}

        <p className="text-xs text-gray-400">
          Hinweis: Keepa kostet ~5 Tokens je ASIN (buybox=1). Beim kleinsten Plan (20 Token/min) dauert ein Pull über 50 ASINs ca. 15 Minuten – die API wartet automatisch auf Token-Regeneration.
        </p>
      </div>

      {/* ── Pull-Log ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-900">Pull-Verlauf</div>
        {logs.length === 0 && <p className="text-sm text-gray-400 px-5 py-4">Noch kein Pull gestartet.</p>}
        <div className="divide-y divide-gray-100">
          {logs.map(l => (
            <div key={l.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{customerName(l.customer_id) || "Alle Kunden"}</div>
                <div className="text-xs text-gray-400">{fmtDT(l.started_at)}{l.finished_at ? " – " + fmtDT(l.finished_at) : ""}</div>
                {l.error_msg && <div className="text-xs text-red-600 mt-0.5">{l.error_msg}</div>}
              </div>
              <div className="text-right">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadge(l.status)}`}>{statusLabel(l.status)}</span>
                <div className="text-xs text-gray-400 mt-1">{l.asins_done}/{l.asins_total} ASINs</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
