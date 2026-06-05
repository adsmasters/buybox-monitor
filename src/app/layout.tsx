import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buy-Box Monitor",
  description: "Buy-Box-Überwachung für Amazon.de",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="h-full">
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
