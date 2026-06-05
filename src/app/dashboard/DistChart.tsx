"use client";
import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

interface BBRow  { asin: string; ts_km: number; seller_id: string; seller_name: string }
interface Seller { seller_id: string; seller_name: string; is_partner: boolean }

interface Props {
  bbHistory: BBRow[];
  sellers: Seller[];
  sellerColor: (id: string | null) => string;
}

export default function DistChart({ bbHistory, sellers, sellerColor }: Props) {
  const sellerMap = useMemo(() => {
    const m: Record<string, Seller> = {};
    sellers.forEach(s => { m[s.seller_id] = s; });
    return m;
  }, [sellers]);

  const counts = useMemo(() => {
    const m: Record<string, { name: string; count: number; is_partner: boolean }> = {};
    bbHistory.forEach(r => {
      if (!r.seller_id || r.seller_id === "-1") return;
      const name = r.seller_name || r.seller_id;
      if (!m[r.seller_id]) m[r.seller_id] = { name, count: 0, is_partner: sellerMap[r.seller_id]?.is_partner ?? false };
      m[r.seller_id].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].count - a[1].count);
  }, [bbHistory, sellerMap]);

  const total = counts.reduce((s, [, v]) => s + v.count, 0);

  const chartData = {
    labels: counts.map(([, v]) => v.name),
    datasets: [{
      data: counts.map(([, v]) => v.count),
      backgroundColor: counts.map(([id]) => sellerColor(id)),
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
          label: (ctx: any) => ` ${ctx.label}: ${(ctx.raw / total * 100).toFixed(1)} %`,
        },
      },
    },
  };

  if (counts.length === 0) return <p className="text-sm text-gray-400">Keine Daten.</p>;

  return (
    <div className="flex flex-col md:flex-row gap-8 items-start">
      <div className="w-64 h-64 flex-shrink-0">
        <Doughnut data={chartData} options={chartOpts} />
      </div>
      <table className="flex-1 text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left pb-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Seller</th>
            <th className="text-left pb-2 text-xs uppercase tracking-wide text-gray-400 font-semibold">Anteil</th>
            <th className="text-left pb-2 text-xs uppercase tracking-wide text-gray-400 font-semibold w-32">Verteilung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {counts.slice(0, 15).map(([id, v]) => {
            const pct = total ? v.count / total * 100 : 0;
            return (
              <tr key={id}>
                <td className="py-2 font-medium text-gray-900">{v.name}</td>
                <td className="py-2 font-semibold text-gray-900">{pct.toFixed(1)} %</td>
                <td className="py-2">
                  <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: sellerColor(id) }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
