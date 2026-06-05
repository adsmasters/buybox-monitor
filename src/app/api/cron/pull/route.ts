import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { runPull } from "@/lib/pull";

export const maxDuration = 300; // mehr Zeit für alle Kunden/ASINs

// Wird vom Vercel-Cron aufgerufen. Vercel sendet automatisch den Header
// "Authorization: Bearer <CRON_SECRET>". Nur damit ausführbar.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  try {
    // customer_id = null → alle ASINs aller Kunden
    const result = await runPull(admin, null);
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
