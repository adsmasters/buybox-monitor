import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json([], { status: 401 });

  const admin = createServiceClient();
  const { data } = await admin.from("pull_log").select("*").order("started_at", { ascending: false }).limit(20);
  return NextResponse.json(data || []);
}
