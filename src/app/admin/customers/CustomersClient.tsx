"use client";
import { useState, useTransition } from "react";

interface Customer { id: string; name: string; email: string; emails?: string[]; created_at: string }
interface AsinRow  { id: string; customer_id: string; asin: string; title: string | null }

interface Props {
  customers: Customer[];
  asins: AsinRow[];
}

export default function CustomersClient({ customers: init, asins: initAsins }: Props) {
  const [customers, setCustomers] = useState(init);
  const [asins, setAsins]         = useState(initAsins);
  const [selected, setSelected]   = useState<Customer | null>(null);
  const [newName, setNewName]     = useState("");
  const [newEmail, setNewEmail]   = useState("");
  const [asinInput, setAsinInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [msg, setMsg]             = useState("");
  const [isPending, startT]       = useTransition();

  function syncSelected(updated: Customer) {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelected(updated);
  }

  async function addEmail() {
    if (!selected || !emailInput.trim()) return;
    const res = await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: selected.id, email: emailInput, action: "add" }),
    });
    const data = await res.json();
    if (data.error) { setMsg("Fehler: " + data.error); return; }
    syncSelected(data.customer);
    setEmailInput("");
    setMsg("E-Mail hinzugefügt.");
  }

  async function removeEmail(email: string) {
    if (!selected) return;
    const res = await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: selected.id, email, action: "remove" }),
    });
    const data = await res.json();
    if (data.error) { setMsg("Fehler: " + data.error); return; }
    syncSelected(data.customer);
  }

  async function addCustomer() {
    if (!newName || !newEmail) return;
    const res = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail }),
    });
    const data = await res.json();
    if (data.error) { setMsg("Fehler: " + data.error); return; }
    setCustomers(prev => [...prev, data.customer]);
    setNewName(""); setNewEmail("");
    setMsg("Kunde angelegt.");
  }

  async function addAsins() {
    if (!selected || !asinInput.trim()) return;
    const asinList = asinInput.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const res = await fetch("/api/admin/asins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: selected.id, asins: asinList }),
    });
    const data = await res.json();
    if (data.error) { setMsg("Fehler: " + data.error); return; }
    setAsins(prev => [...prev, ...data.added]);
    setAsinInput("");
    setMsg(`${data.added.length} ASIN(s) hinzugefügt.`);
  }

  async function removeAsin(id: string) {
    await fetch(`/api/admin/asins?id=${id}`, { method: "DELETE" });
    setAsins(prev => prev.filter(a => a.id !== id));
  }

  const selectedAsins = selected ? asins.filter(a => a.customer_id === selected.id) : [];

  return (
    <main className="max-w-5xl mx-auto px-6 py-7 space-y-8">
      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-2 flex justify-between">
          {msg} <button onClick={() => setMsg("")} className="text-blue-400 hover:text-blue-600">×</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Kunden-Liste ── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-900">Kunden</div>

          {/* Neuen Kunden anlegen */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400" />
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="E-Mail" type="email"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400" />
            <button onClick={addCustomer}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
              Kunden anlegen
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {customers.length === 0 && <p className="text-sm text-gray-400 px-5 py-4">Noch keine Kunden.</p>}
            {customers.map(c => (
              <button key={c.id} onClick={() => setSelected(c)}
                className={`w-full text-left px-5 py-3 transition-colors hover:bg-gray-50 ${selected?.id === c.id ? "bg-blue-50" : ""}`}>
                <div className="font-medium text-sm text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-400">{c.email} · {asins.filter(a => a.customer_id === c.id).length} ASINs</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── E-Mail-Zugänge + ASIN-Verwaltung ── */}
        <div className="space-y-6">
        {selected && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-900">
              Zugänge (E-Mails) · {selected.name}
            </div>
            <div className="px-5 py-4 border-b border-gray-100 flex gap-2">
              <input
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addEmail(); }}
                placeholder="E-Mail des Nutzers (z.B. einkauf@klosterfrau.de)"
                type="email"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
              />
              <button onClick={addEmail}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                Hinzufügen
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {(selected.emails || []).length === 0 && (
                <p className="text-sm text-gray-400 px-5 py-3">Noch keine Zugänge. Jeder hier eingetragene Nutzer sieht genau diese ASINs.</p>
              )}
              {(selected.emails || []).map(em => (
                <div key={em} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-gray-900">{em}</span>
                  <button onClick={() => removeEmail(em)} className="text-gray-300 hover:text-red-500 text-lg leading-none transition-colors">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ASIN-Verwaltung ── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-900">
            {selected ? `ASINs · ${selected.name}` : "ASINs (Kunden auswählen)"}
          </div>

          {selected && (
            <div className="px-5 py-4 border-b border-gray-100 space-y-2">
              <textarea
                value={asinInput}
                onChange={e => setAsinInput(e.target.value)}
                placeholder={"ASINs einfügen (komma-, leerzeichen- oder zeilentrennt)\nz.B.: B001234567, B002345678"}
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none font-mono"
              />
              <button onClick={addAsins}
                className="bg-emerald-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">
                ASINs hinzufügen
              </button>
            </div>
          )}

          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {!selected && <p className="text-sm text-gray-400 px-5 py-4">Kunden links auswählen.</p>}
            {selected && selectedAsins.length === 0 && <p className="text-sm text-gray-400 px-5 py-4">Noch keine ASINs.</p>}
            {selectedAsins.map(a => (
              <div key={a.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <div className="text-xs font-mono text-gray-600">{a.asin}</div>
                  {a.title && <div className="text-xs text-gray-400 truncate max-w-xs">{a.title}</div>}
                </div>
                <button onClick={() => removeAsin(a.id)} className="text-gray-300 hover:text-red-500 text-lg leading-none transition-colors">×</button>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
