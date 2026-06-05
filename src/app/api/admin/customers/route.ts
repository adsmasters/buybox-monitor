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

  const { name, email } = await req.json();
  if (!name || !email) return NextResponse.json({ error: "name und email erforderlich" }, { status: 400 });

  const e = email.trim().toLowerCase();
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("customers")
    .insert({ name, email: e, emails: [e] })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer: data });
}

// E-Mail zu einem Kunden hinzufügen/entfernen
export async function PATCH(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customer_id, email, action } = await req.json();
  if (!customer_id || !email) return NextResponse.json({ error: "customer_id und email erforderlich" }, { status: 400 });

  const e = email.trim().toLowerCase();
  const admin = createServiceClient();
  const { data: cur, error: readErr } = await admin
    .from("customers").select("emails").eq("id", customer_id).single();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  let emails: string[] = cur?.emails || [];
  if (action === "remove") emails = emails.filter((x) => x !== e);
  else if (!emails.includes(e)) emails = [...emails, e];

  const { data, error } = await admin
    .from("customers").update({ emails }).eq("id", customer_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer: data });
}
