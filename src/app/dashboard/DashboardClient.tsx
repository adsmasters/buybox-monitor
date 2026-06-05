"use client";
import { useState, useMemo, useCallback } from "react";
import DrilldownModal from "./DrilldownModal";
import DistChart from "./DistChart";

// ── Typen ──────────────────────────────────────────────────────────────────
interface BBRow   { asin: string; ts: string; ts_km: number; seller_id: string; seller_name: string }
interface PrRow   { asin: string; ts: string; ts_km: number; price_eur: number | null }
interface Seller  { seller_id: string; seller_name: string; is_partner: boolean }
interface Product {
  asin: string; title: string | null; brand: string | null;
  monthly_sold?: number | null;
  sales_rank_drops_30?: number | null;
  sales_rank_drops_90?: number | null;
}

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
function fmtEur0(v: number): string {
  return Math.round(v).toLocaleString("de-DE") + " €";
}
// Nächste Amazon-Badge-Stufe über v (50+→100, 200+→300, 1000+→2000 …).
// Die Obergrenze der aktuellen Stufe ist nextTier-1 verkaufte Einheiten.
function nextTier(v: number): number {
  const tiers = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900,
                 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
                 10000, 20000, 50000, 100000];
  for (const t of tiers) if (t > v) return t;
  return v * 2;
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function DashboardClient({ bbHistory, priceHistory, sellers, products }: Props) {
  const [days, setDays] = useState(90);
  const [filterExternal, setFilterExternal] = useState(false);
  const [feedSearch, setFeedSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [drilldownAsin, setDrilldownAsin] = useState<string | null>(null);
  const [distDaysLeft, setDistDaysLeft] = useState(90);
  const [distDaysRight, setDistDaysRight] = useState(30);
  const [dropDays, setDropDays] = useState(30);

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
    const products = Object.values(productMap);
    // Umsatz/Monat gesamt = Σ (Einheiten × aktueller Preis), als Spanne:
    // Min = Badge-Wert (z. B. 50), Max = nächste Stufe − 1 (z. B. 99)
    let revenueMin = 0, revenueMax = 0;
    for (const p of products) {
      const prs = priceByAsin[p.asin] || [];
      const lastPr = prs.length ? prs[prs.length - 1].price_eur : null;
      if (p.monthly_sold != null && lastPr != null) {
        revenueMin += p.monthly_sold * lastPr;
        revenueMax += (nextTier(p.monthly_sold) - 1) * lastPr;
      }
    }
    // Wechsel letzte 7 Tage
    const cut7 = Date.now() - 7 * 86400_000;
    const changes7 = changes.filter(c => new Date(c.ts).getTime() >= cut7).length;
    return { total: products.length, revenueMin, revenueMax, changes7 };
  }, [productMap, priceByAsin, changes]);

  // Preis-Senker: Seller, die im Zeitraum die Buy Box zu einem NIEDRIGEREN
  // Preis übernommen haben („wer drückt die Preise?"). Pro Übernahme mit
  // price_after < price_before zählt ein Drop für den neuen Seller.
  const priceDroppers = useMemo(() => {
    const cut = Date.now() - dropDays * 86400_000;
    const m: Record<string, { name: string; drops: number; totalDrop: number }> = {};
    for (const c of changes) {
      if (new Date(c.ts).getTime() < cut) continue;
      if (c.price_before == null || c.price_after == null) continue;
      if (c.price_after >= c.price_before) continue;
      const id = c.to_id;
      if (!id || id === "-1" || id === "-2") continue;
      if (!m[id]) m[id] = { name: c.to_name || id, drops: 0, totalDrop: 0 };
      m[id].drops++;
      m[id].totalDrop += c.price_before - c.price_after;
    }
    return Object.entries(m).sort((a, b) => b[1].drops - a[1].drops);
  }, [changes, dropDays]);

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "ASINs überwacht", value: String(kpi.total), sub: "" },
          { label: "Umsatz/Monat gesamt (geschätzt)", value: `${fmtEur0(kpi.revenueMin)} – ${fmtEur0(kpi.revenueMax)}`, sub: "Spanne aus Verkaufsstufen × Preis" },
          { label: "Buy-Box-Wechsel (7 Tage)", value: String(kpi.changes7), sub: "letzte 7 Tage" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 px-6 py-5">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{k.label}</div>
            <div className="text-3xl font-bold text-gray-900">{k.value}</div>
            {k.sub && <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Verteilung (Überblick, ganz oben: grob → detailliert) ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Buy-Box-Verteilung gesamt</h2>
        <p className="text-sm text-gray-500 mb-3">Zeitgewichteter Anteil je Seller über alle ASINs – zwei Zeiträume zum Vergleich</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DistChart bbHistory={bbHistory} sellers={sellers} sellerColor={sellerColor} days={distDaysLeft} setDays={setDistDaysLeft} />
          <DistChart bbHistory={bbHistory} sellers={sellers} sellerColor={sellerColor} days={distDaysRight} setDays={setDistDaysRight} />
        </div>
      </section>

      {/* ── Preis-Senker ── */}
      <section>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-bold text-gray-900">Wer drückt die Preise?</h2>
          <div className="flex flex-wrap gap-1">
            {([7, 14, 30, 60, 90, 120, 180, 365] as const).map(d => (
              <button key={d} onClick={() => setDropDays(d)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${dropDays === d ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                {d === 365 ? "1 Jahr" : `${d} Tage`}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-3">Seller, die die Buy Box am häufigsten zu einem niedrigeren Preis übernommen haben</p>
        <div className="bg-white rounded-xl border border-gray-200">
          {priceDroppers.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Keine Preissenkungen im Zeitraum.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">#</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">Seller</th>
                  <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">Preissenkungen</th>
                  <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">Σ Senkung</th>
                  <th className="text-right px-5 py-3 text-xs uppercase tracking-wide text-gray-400 font-semibold">Ø je Senkung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {priceDroppers.slice(0, 10).map(([id, v], i) => {
                  const type = sellerType(id);
                  return (
                    <tr key={id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-400 font-semibold">{i + 1}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${pillCls(type)}`}>{v.name}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">{v.drops}×</td>
                      <td className="px-5 py-3 text-right text-red-600 font-medium">−{fmtEur(v.totalDrop)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">−{fmtEur(v.totalDrop / v.drops)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Change-Feed ── */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Buy-Box-Wechsel</h2>
        <p className="text-sm text-gray-500 mb-3">Wer hat wann die Buy Box übernommen – chronologisch, neueste zuerst</p>
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-center px-5 py-3 border-b border-gray-100">
            <div className="flex gap-1">
              {([7, 30, 90, 180, 365] as const).map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${days === d ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                  {d === 365 ? "1 Jahr" : `${d} Tage`}
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
                  {["Produkt", "Aktueller Buy-Box-Seller", "Akt. Preis", "Ø 30-Tage", "Verkäufe/Monat", "Umsatz/Monat (Spanne)", "Rank-Drops 90T", "Letzte 30 Tage"].map(h => (
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
                      <td className="px-5 py-3 text-gray-900">
                        {r.monthly_sold != null
                          ? <span className="font-medium">{r.monthly_sold}+</span>
                          : <span className="text-gray-400">n/a</span>}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {r.monthly_sold != null && r.lastPr != null
                          ? <span title={`${r.monthly_sold}–${nextTier(r.monthly_sold) - 1} Einheiten × ${fmtEur(r.lastPr)}`}>
                              {fmtEur0(r.monthly_sold * r.lastPr)} – {fmtEur0((nextTier(r.monthly_sold) - 1) * r.lastPr)}
                            </span>
                          : <span className="text-gray-400">n/a</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {r.sales_rank_drops_90 != null && r.sales_rank_drops_90 >= 0
                          ? r.sales_rank_drops_90
                          : <span className="text-gray-400">n/a</span>}
                      </td>
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
