import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, email } = await req.json();
  if (!name || !email) return NextResponse.json({ error: "name und email erforderlich" }, { status: 400 });

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("customers")
    .insert({ name, email })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer: data });
}
