import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  // Kundendatensatz finden (über Auth-Client, RLS-sicher)
  const { data: customer } = await auth
    .from("customers")
    .select("id, name")
    .eq("email", user.email!)
    .single();

  const customerId = customer?.id ?? null;

  // Admin liest per Service-Client (umgeht RLS, sieht alle Daten);
  // Kunde liest per Auth-Client (RLS begrenzt auf eigene Daten).
  const supabase = isAdmin ? createServiceClient() : auth;

  // ASINs für diesen Kunden
  let asins: string[] = [];
  if (customerId) {
    const { data } = await supabase
      .from("asins")
      .select("asin")
      .eq("customer_id", customerId);
    asins = (data || []).map((r: any) => r.asin);
  } else if (isAdmin) {
    // Admin sieht alle ASINs
    const { data } = await supabase.from("asins").select("asin");
    asins = (data || []).map((r: any) => r.asin);
  }

  if (asins.length === 0) {
    return (
      <>
        <NavBar email={user.email!} isAdmin={isAdmin} />
        <main className="max-w-2xl mx-auto p-8">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-lg font-semibold text-gray-900 mb-2">Noch keine ASINs hinterlegt</p>
            <p className="text-sm text-gray-500">
              {isAdmin
                ? <>Unter &bdquo;Kunden&ldquo; Kunden anlegen und ASINs zuweisen, dann unter &bdquo;Daten holen&ldquo; den ersten Pull starten.</>
                : <>Dein Account wird gerade eingerichtet. Bitte melde dich bei uns.</>}
            </p>
          </div>
        </main>
      </>
    );
  }

  // Daten aus Supabase laden
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  // Supabase liefert max. 1000 Zeilen pro Request → seitenweise alles laden.
  async function fetchAll(table: string, cols: string) {
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(cols)
        .in("asin", asins)
        .gte("ts", cutoff)
        .order("ts_km", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  const [bbHistory, priceHistory, sellersRes, productsRes] = await Promise.all([
    fetchAll("bb_history", "asin, ts, ts_km, seller_id, seller_name"),
    fetchAll("price_history", "asin, ts, ts_km, price_eur"),
    supabase.from("sellers").select("seller_id, seller_name, is_partner"),
    supabase.from("asins").select("asin, title, brand, monthly_sold, sales_rank_drops_30, sales_rank_drops_90").in("asin", asins),
  ]);

  return (
    <>
      <NavBar email={user.email!} isAdmin={isAdmin} />
      <DashboardClient
        bbHistory={bbHistory}
        priceHistory={priceHistory}
        sellers={sellersRes.data || []}
        products={productsRes.data || []}
      />
    </>
  );
}
