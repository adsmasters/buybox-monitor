import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customer_id, asins } = await req.json();
  if (!customer_id || !asins?.length) return NextResponse.json({ error: "customer_id und asins erforderlich" }, { status: 400 });

  // ASINs normalisieren + duplikate entfernen (sonst: "ON CONFLICT cannot affect row a second time")
  const unique = [...new Set(
    (asins as string[])
      .map((a) => (a || "").trim().toUpperCase())
      .filter(Boolean)
  )];
  if (!unique.length) return NextResponse.json({ error: "Keine gültigen ASINs" }, { status: 400 });

  const admin = createServiceClient();
  const rows = unique.map((asin: string) => ({ customer_id, asin }));
  const { data, error } = await admin
    .from("asins")
    .upsert(rows, { onConflict: "customer_id,asin" })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ added: data || [] });
}

export async function DELETE(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });

  const admin = createServiceClient();
  await admin.from("asins").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
