import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { queryProducts, resolveSellers, priceFromRaw, kmToDate, AMAZON_SELLERS, PARTNER_KEYWORDS } from "@/lib/keepa";

export const maxDuration = 60; // Vercel: bis 60s pro Pull-Request

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

const BATCH = 10;
const BB_PRICE_CSV_IDX = 18; // BUY_BOX_SHIPPING (Triplet: Zeit, Preis, Versand)

// Buy-Box-Preis = Preis + Versand; -1 = nicht verfügbar → null
function combineBuyBoxPrice(price: number, shipping: number): number | null {
  const p = priceFromRaw(price);
  if (p === null) return null;
  const s = shipping > 0 ? shipping / 100 : 0;
  return Math.round((p + s) * 100) / 100;
}

// Letzten Wert je ts_km behalten – verhindert Postgres-Fehler
// "ON CONFLICT cannot affect row a second time"
function dedupeByTsKm<T extends { ts_km: number }>(rows: T[]): T[] {
  const map = new Map<number, T>();
  for (const r of rows) map.set(r.ts_km, r);
  return [...map.values()];
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customer_id } = await req.json();
  const admin = createServiceClient();

  // ASINs laden
  let query = admin.from("asins").select("asin, customer_id");
  if (customer_id) query = query.eq("customer_id", customer_id);
  const { data: asinRows, error: asinErr } = await query;
  if (asinErr) return NextResponse.json({ error: asinErr.message }, { status: 500 });

  const asins: string[] = [...new Set<string>((asinRows || []).map((r: any) => r.asin as string))];
  if (!asins.length) return NextResponse.json({ error: "Keine ASINs gefunden" }, { status: 400 });

  // Pull-Log anlegen
  const { data: logRow } = await admin
    .from("pull_log")
    .insert({ customer_id: customer_id || null, status: "running", asins_total: asins.length, asins_done: 0 })
    .select()
    .single();
  const logId = logRow?.id;

  // Seller-Cache laden
  const { data: cachedSellers } = await admin.from("sellers").select("seller_id, seller_name");
  const sellerCache: Record<string, string> = { ...AMAZON_SELLERS };
  (cachedSellers || []).forEach((s: any) => { sellerCache[s.seller_id] = s.seller_name; });

  let done = 0;
  const errors: string[] = [];

  for (let i = 0; i < asins.length; i += BATCH) {
    const batch = asins.slice(i, i + BATCH);
    try {
      const products = await queryProducts(batch);

      // Alle Seller-IDs dieses Batches sammeln; unbekannte neu auflösen
      const seenIds = new Set<string>();
      const unknownIds = new Set<string>();
      for (const p of products) {
        const bb = p.buyBoxSellerIdHistory || [];
        for (let j = 1; j < bb.length; j += 2) {
          const sid = String(bb[j]);
          if (sid === "-1" || sid === "-2") continue;
          seenIds.add(sid);
          if (!sellerCache[sid]) unknownIds.add(sid);
        }
      }
      if (unknownIds.size > 0) {
        const resolved = await resolveSellers([...unknownIds]);
        for (const [id, name] of Object.entries(resolved)) sellerCache[id] = name;
      }
      // is_partner für ALLE gesehenen Seller (re-)setzen – auch bereits bekannte,
      // damit neue Partner-Keywords rückwirkend greifen.
      for (const id of seenIds) {
        const name = sellerCache[id] || id;
        const isPartner = PARTNER_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));
        const { error } = await admin
          .from("sellers")
          .upsert({ seller_id: id, seller_name: name, is_partner: isPartner }, { onConflict: "seller_id" });
        if (error) errors.push(`seller ${id}: ${error.message}`);
      }

      for (const p of products) {
        const asin = p.asin;
        if (!asin) continue;

        // Produkt-Meta aktualisieren
        await admin.from("asins").update({ title: p.title || null, brand: p.brand || null })
          .eq("asin", asin);

        // Buy-Box-Historie
        const bbHist = p.buyBoxSellerIdHistory || [];
        if (bbHist.length >= 2) {
          const bbRows: any[] = [];
          for (let j = 0; j < bbHist.length - 1; j += 2) {
            const km = bbHist[j];
            const sid = String(bbHist[j + 1]);
            bbRows.push({
              asin,
              ts: kmToDate(km).toISOString(),
              ts_km: km,
              seller_id: sid,
              seller_name: sellerCache[sid] || (sid === "-1" ? "Kein Seller" : sid === "-2" ? "Unbekannter Seller" : sid),
            });
          }
          const deduped = dedupeByTsKm(bbRows);
          if (deduped.length) {
            const { error } = await admin.from("bb_history").upsert(deduped, { onConflict: "asin,ts_km" });
            if (error) errors.push(`bb ${asin}: ${error.message}`);
          }
        }

        // Preis-Historie: csv[18] = BUY_BOX_SHIPPING im Triplet-Format
        // [keepaMinute, preis, versand, keepaMinute, preis, versand, …]
        const csv = p.csv || [];
        const prSeries = csv[BB_PRICE_CSV_IDX];
        if (prSeries && prSeries.length >= 3) {
          const prRows: any[] = [];
          for (let j = 0; j < prSeries.length - 2; j += 3) {
            const km       = prSeries[j];
            const price    = prSeries[j + 1];
            const shipping = prSeries[j + 2];
            const eur = combineBuyBoxPrice(price, shipping);
            prRows.push({ asin, ts: kmToDate(km).toISOString(), ts_km: km, price_eur: eur });
          }
          const deduped = dedupeByTsKm(prRows);
          if (deduped.length) {
            const { error } = await admin.from("price_history").upsert(deduped, { onConflict: "asin,ts_km" });
            if (error) errors.push(`price ${asin}: ${error.message}`);
          }
        }

        done++;
      }

      // Fortschritt loggen
      if (logId) {
        await admin.from("pull_log").update({ asins_done: done }).eq("id", logId);
      }
    } catch (e: any) {
      errors.push(e.message);
    }
  }

  // Log abschließen
  if (logId) {
    await admin.from("pull_log").update({
      status: errors.length ? "error" : "done",
      asins_done: done,
      finished_at: new Date().toISOString(),
      error_msg: errors.length ? errors.slice(0, 3).join("; ") : null,
    }).eq("id", logId);
  }

  return NextResponse.json({ asins_done: done, errors });
}
