"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  email: string;
  isAdmin: boolean;
}

export default function NavBar({ email, isAdmin }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
        pathname.startsWith(href)
          ? "bg-gray-100 text-gray-900 font-medium"
          : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-white border-b border-gray-200 px-6 h-14 flex items-center gap-2">
      <span className="font-bold text-gray-900 mr-4">Buy-Box Monitor</span>
      {link("/dashboard", "Dashboard")}
      {isAdmin && link("/admin/customers", "Kunden")}
      {isAdmin && link("/admin/pull", "Daten holen")}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-400">{email}</span>
        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          Abmelden
        </button>
      </div>
    </nav>
  );
}
