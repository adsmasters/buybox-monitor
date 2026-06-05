import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Kein Code → könnte Implicit Flow mit Hash-Token sein.
  // Client-seitige HTML-Seite zurückgeben die den Hash verarbeitet.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Anmelden…</title></head>
<body>
<script>
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const SUPABASE_URL = '${process.env.NEXT_PUBLIC_SUPABASE_URL}';
  const ANON_KEY = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}';

  if (access_token && refresh_token) {
    // Session via REST API setzen
    fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {'Content-Type':'application/json','apikey':ANON_KEY,'Authorization':'Bearer ' + access_token},
      body: JSON.stringify({refresh_token})
    })
    .then(r => r.json())
    .then(data => {
      if (data.access_token) {
        // Cookie setzen und weiterleiten
        document.cookie = 'sb-cnzvbpmzojinypqfrtnu-auth-token=' + JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at
        }) + '; path=/; max-age=3600; SameSite=Lax';
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/login?error=session';
      }
    })
    .catch(() => { window.location.href = '/login?error=session'; });
  } else {
    window.location.href = '/login?error=auth';
  }
<\/script>
<p style="font-family:sans-serif;text-align:center;margin-top:40vh;color:#666">Anmeldung wird verarbeitet…</p>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
