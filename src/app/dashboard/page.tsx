import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  // Kundendatensatz finden
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name")
    .eq("email", user.email!)
    .single();

  // Wenn Admin und noch kein Customer-Eintrag: Admin-Ansicht
  const customerId = customer?.id ?? null;

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

  const [bbRes, prRes, sellersRes, productsRes] = await Promise.all([
    supabase
      .from("bb_history")
      .select("asin, ts, ts_km, seller_id, seller_name")
      .in("asin", asins)
      .gte("ts", cutoff)
      .order("ts_km", { ascending: true }),
    supabase
      .from("price_history")
      .select("asin, ts, ts_km, price_eur")
      .in("asin", asins)
      .gte("ts", cutoff)
      .order("ts_km", { ascending: true }),
    supabase.from("sellers").select("seller_id, seller_name, is_partner"),
    supabase.from("asins").select("asin, title, brand").in("asin", asins),
  ]);

  return (
    <>
      <NavBar email={user.email!} isAdmin={isAdmin} />
      <DashboardClient
        bbHistory={bbRes.data || []}
        priceHistory={prRes.data || []}
        sellers={sellersRes.data || []}
        products={productsRes.data || []}
      />
    </>
  );
}
