"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Buy-Box Monitor</h1>
          <p className="text-sm text-gray-500 mt-1">Amazon.de</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-3xl mb-3">📬</div>
            <p className="font-semibold text-gray-900">E-Mail verschickt</p>
            <p className="text-sm text-gray-500 mt-1">
              Klick auf den Link in der E-Mail an <strong>{email}</strong> um dich einzuloggen.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="deine@email.de"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading ? "Sende …" : "Magic Link senden"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
