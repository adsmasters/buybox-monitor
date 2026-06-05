// Admin-Zugänge (Agentur-Team): ADMIN_EMAIL kann eine kommagetrennte Liste sein,
// z. B. "hallo@tobias-dziuba.de, mitarbeiter1@adsmasters.de".
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
