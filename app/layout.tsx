import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kola-cameroon.whackyhistory.chatgpt.site"),
  title: "Kola | Online stores, orders and local delivery",
  description: "Create an online store, take structured orders and manage local delivery from one workspace.",
  openGraph: {
    title: "Kola | Your online store and delivery operations",
    description: "Create a storefront, take structured orders and coordinate local delivery.",
    images: [{ url: "/og.png", width: 1536, height: 904, alt: "Kola commerce and logistics platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kola | Online stores, orders and local delivery",
    description: "Create a storefront, take orders and coordinate local delivery.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
