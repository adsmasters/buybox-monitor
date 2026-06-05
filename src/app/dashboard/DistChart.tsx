"use client";
import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const KEEPA_EPOCH_MS = new Date("2011-01-01T00:00:00Z").getTime();

interface BBRow  { asin: string; ts_km: number; seller_id: string; seller_name: string }
interface Seller { seller_id: string; seller_name: string; is_partner: boolean }

interface Props {
  bbHistory: BBRow[];
  sellers: Seller[];
  sellerColor: (id: string | null) => string;
  days: number;
  setDays: (d: number) => void;
}

export default function DistChart({ bbHistory, sellers, sellerColor, days, setDays }: Props) {
  const sellerMap = useMemo(() => {
    const m: Record<string, Seller> = {};
    sellers.forEach(s => { m[s.seller_id] = s; });
    return m;
  }, [sellers]);

  // Zeitgewichteter Anteil: wie LANGE hielt jeder Seller die Buy Box im Fenster.
  const shares = useMemo(() => {
    const nowKm = Math.floor((Date.now() - KEEPA_EPOCH_MS) / 60000);
    const cut = nowKm - days * 1440;

    // nach ASIN gruppieren (bbHistory ist global aufsteigend nach ts_km)
    const byAsin: Record<string, BBRow[]> = {};
    bbHistory.forEach(r => { (byAsin[r.asin] ??= []).push(r); });

    const dur: Record<string, { name: string; minutes: number; is_partner: boolean }> = {};
    for (const rows of Object.values(byAsin)) {
      for (let i = 0; i < rows.length; i++) {
        const id = rows[i].seller_id;
        if (!id || id === "-1") continue;
        const segStart = Math.max(rows[i].ts_km, cut);
        const segEnd   = i + 1 < rows.length ? rows[i + 1].ts_km : nowKm;
        const minutes  = segEnd - segStart;
        if (minutes <= 0) continue;
        const name = rows[i].seller_name || id;
        if (!dur[id]) dur[id] = { name, minutes: 0, is_partner: sellerMap[id]?.is_partner ?? false };
        dur[id].minutes += minutes;
      }
    }
    return Object.entries(dur).sort((a, b) => b[1].minutes - a[1].minutes);
  }, [bbHistory, sellerMap, days]);

  const total = shares.reduce((s, [, v]) => s + v.minutes, 0);

  const chartData = {
    labels: shares.map(([, v]) => v.name),
    datasets: [{
      data: shares.map(([, v]) => v.minutes),
      backgroundColor: shares.map(([id]) => sellerColor(id)),
      borderWidth: 2,
      borderColor: "#fff",
    }],
  };

  const chartOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.label}: ${total ? (ctx.raw / total * 100).toFixed(1) : 0} %`,
        },
      },
    },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="mb-4">
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 font-medium text-gray-700 focus:outline-none focus:border-blue-400 cursor-pointer"
        >
          {[7, 14, 30, 60, 90, 120, 180, 365].map(d => (
            <option key={d} value={d}>{d === 365 ? "Letztes Jahr" : `Letzte ${d} Tage`}</option>
          ))}
        </select>
      </div>

      {shares.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Keine Daten im Zeitraum.</p>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-48 h-48 mb-4">
            <Doughnut data={chartData} options={chartOpts} />
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {shares.slice(0, 8).map(([id, v]) => {
                const pct = total ? v.minutes / total * 100 : 0;
                return (
                  <tr key={id}>
                    <td className="py-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: sellerColor(id) }} />
                      <span className="font-medium text-gray-900">{v.name}</span>
                    </td>
                    <td className="py-1.5 text-right font-semibold text-gray-900 w-16">{pct.toFixed(1)} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
