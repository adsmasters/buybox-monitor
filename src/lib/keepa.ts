// Keepa REST API – direkte HTTP-Aufrufe (kein Python-Client nötig)
const KEEPA_EPOCH_MS = new Date("2011-01-01T00:00:00Z").getTime();
const DOMAIN = 3; // Amazon.de

export function kmToDate(km: number): Date {
  return new Date(KEEPA_EPOCH_MS + km * 60_000);
}

export function priceFromRaw(raw: number | null): number | null {
  if (raw == null || raw < 0) return null;
  return raw / 100;
}

// Keepa-Produkt-Abfrage (buybox + history)
export async function queryProducts(asins: string[]): Promise<KeepaProduct[]> {
  const key = process.env.KEEPA_API_KEY!;
  const url = new URL("https://api.keepa.com/product");
  url.searchParams.set("key", key);
  url.searchParams.set("domain", String(DOMAIN));
  url.searchParams.set("asin", asins.join(","));
  url.searchParams.set("buybox", "1");
  url.searchParams.set("history", "1");
  url.searchParams.set("offers", "0");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Keepa HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.products || [];
}

// Seller-Namen auflösen
export async function resolveSellers(sellerIds: string[]): Promise<Record<string, string>> {
  if (!sellerIds.length) return {};
  const key = process.env.KEEPA_API_KEY!;
  const url = new URL("https://api.keepa.com/seller");
  url.searchParams.set("key", key);
  url.searchParams.set("domain", String(DOMAIN));
  url.searchParams.set("seller", sellerIds.join(","));

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return {};
  const data = await res.json();

  const result: Record<string, string> = {};
  for (const [id, info] of Object.entries(data.sellers || {})) {
    result[id] = (info as any).sellerName || id;
  }
  return result;
}

export interface KeepaProduct {
  asin: string;
  title?: string;
  brand?: string;
  buyBoxSellerIdHistory?: number[];
  csv?: (number[] | null)[];
}

// Bekannte Amazon-eigene Seller-IDs
export const AMAZON_SELLERS: Record<string, string> = {
  A3JWKAKR8XB7XF: "Amazon.de",
  A1PA6795UKMFR9: "Amazon.de",
  ATVPDKIKX0DER:  "Amazon.com",
};
