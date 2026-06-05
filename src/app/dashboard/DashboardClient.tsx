"use client";
import { useState, useMemo, useCallback } from "react";
import DrilldownModal from "./DrilldownModal";
import DistChart from "./DistChart";

// ── Typen ──────────────────────────────────────────────────────────────────
interface BBRow   { asin: string; ts: string; ts_km: number; seller_id: string; seller_name: string }
interface PrRow   { asin: string; ts: string; ts_km: number; price_eur: number | null }
interface Seller  { seller_id: string; seller_name: string; is_partner: boolean }
interface Product { asin: string; title: string | null; brand: string | null }

interface Props {
  bbHistory: BBRow[];
  priceHistory: PrRow[];
  sellers: Seller[];
  products: Product[];
}

// ── Farben ─────────────────────────────────────────────────────────────────
const PALETTE = ["#1a56db","#0d7a4e","#c0392b","#9b59b6","#e67e22","#16a085","#2980b9","#8e44ad","#d35400","#27ae60","#f39c12","#2c3e50"];
const colorCache: Record<string, string> = {};
let ci = 0;
function sellerColor(id: string | null): string {
  if (!id || id === "-1") return "#e8eaed";
  if (id === "-2") return "#aab4c0";
  if (!colorCache[id]) { colorCache[id] = PALETTE[ci % PALETTE.length]; ci++; }
  return colorCache[id];
}

function fmtEur(v: number | null | undefined): string {
  if (v == null) return "n/a";
  return v.toFixed(2).replace(".", ",") + " €";
}
function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function DashboardClient({ bbHistory, priceHistory, sellers, products }: Props) {
  const [days, setDays] = useState(7);
  const [filterExternal, setFilterExternal] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [drilldownAsin, setDrilldownAsin] = useState<string | null>(null);

  const sellerMap = useMemo(() => {
    const m: Record<string, Seller> = {};
    sellers.forEach(s => { m[s.seller_id] = s; });
    return m;
  }, [sellers]);

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach(p => { m[p.asin] = p; });
    return m;
  }, [products]);

  function sellerType(id: string | null): "partner" | "external" | "none" | "unknown" {
    if (!id || id === "-1") return "none";
    if (id === "-2") return "unknown";
    return sellerMap[id]?.is_partner ? "partner" : "external";
  }

  // Preise als Lookup
  const priceByAsin = useMemo(() => {
    const m: Record<string, PrRow[]> = {};
    priceHistory.forEach(r => { (m[r.asin] ??= []).push(r); });
    return m;
  }, [priceHistory]);

  function priceAt(asin: string, ts_km: number): number | null {
    const rows = priceByAsin[asin] || [];
    let val: number | null = null;
    for (const r of rows) { if (r.ts_km <= ts_km) val = r.price_eur; else break; }
    return val;
  }

  // Buy-Box-Wechsel
  const changes = useMemo(() => {
    const byAsin: Record<string, BBRow[]> = {};
    bbHistory.forEach(r => { (byAsin[r.asin] ??= []).push(r); });
    const result: any[] = [];
    for (const [asin, rows] of Object.entries(byAsin)) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].seller_id === rows[i-1].seller_id) continue;
        result.push({
          ts: rows[i].ts,
          ts_km: rows[i].ts_km,
          asin,
          from_id: rows[i-1].seller_id,
          from_name: rows[i-1].seller_name,
          to_id: rows[i].seller_id,
          to_name: rows[i].seller_name,
          price_before: priceAt(asin, rows[i-1].ts_km),
          price_after: priceAt(asin, rows[i].ts_km),
        });
      }
    }
    return result.sort((a, b) => b.ts_km - a.ts_km);
  }, [bbHistory, priceByAsin]);

  // Gefilterte Wechsel
  const filteredChanges = useMemo(() => {
    const nowMs = Date.now();
    const cutMs = nowMs - days * 86400_000;
    let items = changes.filter(c => new Date(c.ts).getTime() >= cutMs);
    if (filterExternal) items = items.filter(c => sellerType(c.to_id) === "external");
    if (feedSearch) {
      const q = feedSearch.toLowerCase();
      items = items.filter(c =>
        (productMap[c.asin]?.title || c.asin).toLowerCase().includes(q) ||
        (c.from_name || "").toLowerCase().includes(q) ||
        (c.to_name || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [changes, days, filterExternal, feedSearch, sellerMap]);

  // Aktueller BB je ASIN
  const currentBB = useMemo(() => {
    const m: Record<string, BBRow> = {};
    bbHistory.forEach(r => { m[r.asin] = r; });
    return m;
  }, [bbHistory]);

  // KPIs
  const kpi = useMemo(() => {
    const asins = Object.keys(productMap);
    let partner = 0, external = 0;
    asins.forEach(a => {
      const t = sellerType(currentBB[a]?.seller_id ?? null);
      if (t === "partner") partner++;
      else if (t === "external") external++;
    });
    return { total: asins.length, partner, external, changes: changes.length };
  }, [productMap, currentBB]);

  // Tabellen-Daten
  const tableRows = useMemo(() => {
    const nowKm = Math.floor((Date.now() - new Date("2011-01-01T00:00:00Z").getTime()) / 60000);
    const cut30 = nowKm - 30 * 1440;
    return Object.values(productMap).filter(p => {
      if (!tableSearch) return true;
      const q = tableSearch.toLowerCase();
      return p.asin.toLowerCase().includes(q) || (p.title || "").toLowerCase().includes(q);
    }).map(p => {
      const bb = currentBB[p.asin];
      const prs = priceByAsin[p.asin] || [];
      const lastPr = prs.length ? prs[prs.length - 1].price_eur : null;
      const pr30 = prs.filter(r => r.ts_km >= cut30).map(r => r.price_eur).filter(v => v != null) as number[];
      const avg30 = pr30.length ? pr30.reduce((a, b) => a + b, 0) / pr30.length : null;
      return { ...p, bb, lastPr, avg30 };
    });
  }, [productMap, currentBB, priceByAsin, tableSearch]);

  // Sparklines
  const bbByAsin = useMemo(() => {
    const m: Record<string, BBRow[]> = {};
    bbHistory.forEach(r => { (m[r.asin] ??= []).push(r); });
    return m;
  }, [bbHistory]);

  function pillCls(type: string) {
    if (type === "partner")  return "bg-emerald-50 text-emerald-700";
    if (type === "external") return "bg-red-50 text-red-700";
    if (type === "unknown")  return "bg-gray-100 text-gray-500";
    return "bg-gray-100 text-gray-600";
  }
  function pillLabel(id: string, name: string) {
    if (id === "-1") return "Kein Seller";
    if (id === "-2") return "Unbekannt";
    return name || id;
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-7 space-y-8">

      {/* ── KPI-Leiste ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "ASINs überwacht", value: kpi.total, sub: "" },
          { label: "Buy-Box-Wechsel (90 Tage)", value: kpi.changes, sub: "" },
          { label: "Aktuell Partner-BB", value: kpi.partner, sub: kpi.total ? `${Math.round(kpi.partner / kpi.total * 100)} %` : "", color: "text-emerald-600" },
          { label: "Aktuell Fremd-BB", value: kpi.external, sub: kpi.total ? `${Math.round(kpi.external / kpi.total * 100)} %` : "", color: "text-red-600" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 px-6 py-5">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{k.label}</div>
            <div className={`text-3xl font-bold ${k.color || "text-gray-900"}`}>{k.value}</div>
            {k.sub && <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Change-Feed ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Buy-Box-Wechsel</h2>
        <p className="text-sm text-gray-500 mb-3">Wer hat wann die Buy Box übernommen – chronologisch, neueste zuerst</p>
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-center px-5 py-3 border-b border-gray-100">
            <div className="flex gap-1">
              {([7, 30, 90] as const).map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${days === d ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                  {d} Tage
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={filterExternal} onChange={e => setFilterExternal(e.target.checked)} className="rounded" />
              Nur Verluste an Fremd-Seller
            </label>
            <input
              value={feedSearch} onChange={e => setFeedSearch(e.target.value)}
              placeholder="Produkt oder Seller suchen …"
              className="ml-auto text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 w-60"
            />
          </div>

          {/* Feed */}
          <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
            {filteredChanges.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Keine Wechsel im gewählten Zeitraum.</p>
            ) : filteredChanges.map((c, i) => {
              const fromType = sellerType(c.from_id);
              const toType   = sellerType(c.to_id);
              const priceDiff = c.price_before != null && c.price_after != null ? c.price_after - c.price_before : null;
              const title = productMap[c.asin]?.title || c.asin;
              return (
                <div key={i} onClick={() => setDrilldownAsin(c.asin)}
                  className="grid grid-cols-[140px_1fr_auto] gap-4 items-center px-5 py-4 hover:bg-gray-50 cursor-pointer">
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{fmtDate(c.ts)}</div>
                    <div className="text-xs text-gray-400">{fmtTime(c.ts)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{title}</div>
                    <div className="text-xs text-gray-400">{c.asin}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pillCls(fromType)}`}>{pillLabel(c.from_id, c.from_name)}</span>
                      <span className="text-gray-300 text-base">→</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pillCls(toType)}`}>{pillLabel(c.to_id, c.to_name)}</span>
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="font-bold text-sm text-gray-900">{fmtEur(c.price_after)}</div>
                    {priceDiff != null && (
                      <div className={`text-xs font-medium ${priceDiff < 0 ? "text-red-600" : priceDiff > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                        {priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(2).replace(".", ",")} €
                      </div>
                    )}
                    <div className="text-xs text-gray-400">vorher: {fmtEur(c.price_before)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Status-Tabelle ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Aktueller Status je ASIN</h2>
        <p className="text-sm text-gray-500 mb-3">Klick auf eine Zeile öffnet die Drilldown-Timeline</p>
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-100">
            <input
              value={tableSearch} onChange={e => setTableSearch(e.target.value)}
              placeholder="ASIN oder Produkt suchen …"
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 w-72"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Produkt", "Aktueller Buy-Box-Seller", "Akt. Preis", "Ø 30-Tage", "Letzte 30 Tage"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs uppercase tracking-wide text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableRows.map(r => {
                  const bbType = sellerType(r.bb?.seller_id ?? null);
                  const sparkRows = (bbByAsin[r.asin] || []).filter(row => {
                    const nowKm = Math.floor((Date.now() - new Date("2011-01-01T00:00:00Z").getTime()) / 60000);
                    return row.ts_km >= nowKm - 30 * 1440;
                  });
                  const nowKm = Math.floor((Date.now() - new Date("2011-01-01T00:00:00Z").getTime()) / 60000);
                  const span = 30 * 1440;
                  return (
                    <tr key={r.asin} onClick={() => setDrilldownAsin(r.asin)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-5 py-3 max-w-xs">
                        <div className="font-medium text-gray-900 truncate">{r.title || r.asin}</div>
                        <div className="text-xs text-gray-400">{r.asin}</div>
                      </td>
                      <td className="px-5 py-3">
                        {r.bb ? (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${pillCls(bbType)}`}>
                            {pillLabel(r.bb.seller_id, r.bb.seller_name)}
                          </span>
                        ) : <span className="text-gray-300">n/a</span>}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{fmtEur(r.lastPr)}</td>
                      <td className="px-5 py-3 text-gray-600">{fmtEur(r.avg30)}</td>
                      <td className="px-5 py-3">
                        {sparkRows.length === 0 ? <span className="text-gray-300 text-xs">n/a</span> : (
                          <div className="flex h-3.5 rounded overflow-hidden gap-px w-28">
                            {sparkRows.map((row, idx) => {
                              const from = Math.max(row.ts_km, nowKm - span);
                              const to   = idx + 1 < sparkRows.length ? sparkRows[idx+1].ts_km : nowKm;
                              const pct  = Math.max(0.5, (to - from) / span * 100);
                              return <div key={idx} style={{ width: `${pct}%`, background: sellerColor(row.seller_id) }} title={row.seller_name} />;
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Verteilung ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Buy-Box-Verteilung gesamt</h2>
        <p className="text-sm text-gray-500 mb-3">Anteil je Seller über alle ASINs, letzte 90 Tage</p>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <DistChart bbHistory={bbHistory} sellers={sellers} sellerColor={sellerColor} />
        </div>
      </section>

      {/* ── Drilldown-Modal ── */}
      {drilldownAsin && (
        <DrilldownModal
          asin={drilldownAsin}
          product={productMap[drilldownAsin]}
          bbHistory={bbByAsin[drilldownAsin] || []}
          priceHistory={priceByAsin[drilldownAsin] || []}
          sellerColor={sellerColor}
          onClose={() => setDrilldownAsin(null)}
        />
      )}
    </main>
  );
}
