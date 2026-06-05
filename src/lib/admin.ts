// Admin-Zugänge (Agentur-Team):
// - ADMIN_EMAIL: kommagetrennte Einzeladressen (z. B. externe Berater)
// - ADMIN_DOMAIN: kommagetrennte Domains – JEDE Adresse dieser Domain ist Team/Admin
//   (Standard: adsmasters.de → hallo@, hi@, philipp@ … sehen automatisch alles)
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function adminDomains(): string[] {
  return (process.env.ADMIN_DOMAIN || "adsmasters.de")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  if (adminEmails().includes(e)) return true;
  const domain = e.split("@")[1];
  return !!domain && adminDomains().includes(domain);
}
