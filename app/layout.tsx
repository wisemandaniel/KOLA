import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kola — Cameroon commerce, delivered",
  description: "Shop, sell and deliver across Cameroon with built-in logistics and shared order conversations.",
  openGraph: {
    title: "Kola — Cameroon commerce, delivered",
    description: "Shop, sell and deliver with logistics and shared order conversations built in.",
    images: [{ url: "/og.png", width: 1536, height: 904, alt: "Kola commerce and logistics platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kola — Cameroon commerce, delivered",
    description: "Shop, sell and deliver with logistics built in.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
