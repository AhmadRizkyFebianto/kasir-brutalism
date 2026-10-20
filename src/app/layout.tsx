import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kopi & Space Hub — Kasir",
  description: "Terminal kasir untuk kopi, makanan, dan reservasi space.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
