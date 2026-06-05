"use client";
import { useEffect, useRef } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, TimeScale, Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { de } from "date-fns/locale";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, TimeScale, Filler);

const KEEPA_EPOCH_MS = new Date("2011-01-01T00:00:00Z").getTime();
function kmToDate(km: number) { return new Date(KEEPA_EPOCH_MS + km * 60_000); }
function fmtDT(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
         d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtEur(v: number | null) { return v != null ? v.toFixed(2).replace(".", ",") + " €" : "n/a"; }

interface BBRow   { asin: string; ts: string; ts_km: number; seller_id: string; seller_name: string }
interface PrRow   { asin: string; ts: string; ts_km: number; price_eur: number | null }
interface Product { asin: string; title: string | null; brand: string | null }

interface Props {
  asin: string;
  product?: Product;
  bbHistory: BBRow[];
  priceHistory: PrRow[];
  sellerColor: (id: string | null) => string;
  onClose: () => void;
}

export default function DrilldownModal({ asin, product, bbHistory, priceHistory, sellerColor, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nowKm  = Math.floor((Date.now() - KEEPA_EPOCH_MS) / 60_000);
  const cut90  = nowKm - 90 * 1440;
  const span90 = nowKm - cut90;

  // Buy-Box-Band
  const seenSellers: Record<string, { name: string; color: string }> = {};
  const bandSegs = bbHistory.map((row, i) => {
    const from = Math.max(row.ts_km, cut90);
    const to   = i + 1 < bbHistory.length ? bbHistory[i + 1].ts_km : nowKm;
    const pct  = Math.max(0.2, (to - from) / span90 * 100);
    const col  = sellerColor(row.seller_id);
    const name = row.seller_name || row.seller_id;
    seenSellers[row.seller_id] = { name, color: col };
    return { pct, col, from, to, name };
  });

  // Preis-Chart-Daten
  const chartData = {
    datasets: [{
      data: priceHistory.map(r => ({ x: kmToDate(r.ts_km).getTime(), y: r.price_eur })),
      borderColor: "#1a56db",
      backgroundColor: "rgba(26,86,219,0.07)",
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      tension: 0,
    }],
  };

  const chartOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "time",
        adapters: { date: { locale: de } },
        time: { unit: "day", displayFormats: { day: "dd.MM." } },
        ticks: { color: "#6b7280", maxTicksLimit: 12 },
        grid: { color: "#f3f4f6" },
      },
      y: {
        ticks: {
          color: "#6b7280",
          callback: (v: number) => v.toFixed(2).replace(".", ",") + " €",
        },
        grid: { color: "#f3f4f6" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (ctx: any) => fmtDT(new Date(ctx[0].parsed.x)),
          label: (ctx: any) => " " + fmtEur(ctx.parsed.y),
        },
      },
    },
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-7">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">{product?.title || asin}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{asin}{product?.brand ? " · " + product.brand : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none font-light">×</button>
        </div>

        {/* Buy-Box-Band */}
        <div className="mb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Buy-Box-Besitz · letzte 90 Tage</p>
          {bandSegs.length === 0 ? (
            <p className="text-sm text-gray-400">Keine Daten</p>
          ) : (
            <div
              className="flex h-9 rounded-lg overflow-hidden w-full"
              onMouseLeave={() => {}}
            >
              {bandSegs.map((s, i) => (
                <div
                  key={i}
                  style={{ width: `${s.pct}%`, background: s.col }}
                  title={`${s.name}\n${fmtDT(kmToDate(s.from))} – ${fmtDT(kmToDate(s.to))}`}
                  className="h-full cursor-default transition-opacity hover:opacity-75"
                />
              ))}
            </div>
          )}
        </div>

        {/* Legende */}
        <div className="flex flex-wrap gap-3 mb-6 mt-3">
          {Object.entries(seenSellers).map(([id, s]) => (
            <div key={id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              {s.name}
            </div>
          ))}
        </div>

        {/* Preislinie */}
        {priceHistory.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Buy-Box-Preis (€)</p>
            <div className="h-48">
              <Line data={chartData} options={chartOpts} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Keine Preisdaten verfügbar.</p>
        )}
      </div>
    </div>
  );
}
