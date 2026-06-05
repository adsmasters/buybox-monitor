import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { queryProducts, resolveSellers, priceFromRaw, kmToDate, AMAZON_SELLERS } from "@/lib/keepa";

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

const BATCH = 10;
const BB_PRICE_CSV_IDX = 18; // BUY_BOX_SHIPPING

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

      // Seller-IDs aus diesem Batch sammeln und auflösen
      const unknownIds = new Set<string>();
      for (const p of products) {
        const bb = p.buyBoxSellerIdHistory || [];
        for (let j = 1; j < bb.length; j += 2) {
          const sid = String(bb[j]);
          if (!sellerCache[sid] && sid !== "-1" && sid !== "-2") unknownIds.add(sid);
        }
      }
      if (unknownIds.size > 0) {
        const resolved = await resolveSellers([...unknownIds]);
        for (const [id, name] of Object.entries(resolved)) {
          sellerCache[id] = name;
          await admin.from("sellers").upsert({ seller_id: id, seller_name: name }, { onConflict: "seller_id" });
        }
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
          if (bbRows.length) {
            await admin.from("bb_history").upsert(bbRows, { onConflict: "asin,ts_km" });
          }
        }

        // Preis-Historie (csv[18] = BUY_BOX_SHIPPING)
        const csv = p.csv || [];
        const prSeries = csv[BB_PRICE_CSV_IDX];
        if (prSeries && prSeries.length >= 2) {
          const prRows: any[] = [];
          for (let j = 0; j < prSeries.length - 1; j += 2) {
            const km  = prSeries[j];
            const raw = prSeries[j + 1];
            prRows.push({ asin, ts: kmToDate(km).toISOString(), ts_km: km, price_eur: priceFromRaw(raw) });
          }
          if (prRows.length) {
            await admin.from("price_history").upsert(prRows, { onConflict: "asin,ts_km" });
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
