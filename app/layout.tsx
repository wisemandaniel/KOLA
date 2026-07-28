import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import ThemeToggle from "./ThemeToggle";

const themeScript = `
  (function () {
    try {
      var saved = localStorage.getItem("kola-theme");
      var theme = saved === "dark" || saved === "light"
        ? saved
        : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.dataset.theme = theme;
    } catch (_) {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export const metadata: Metadata = {
  metadataBase: new URL("https://kola-cameroon.whackyhistory.chatgpt.site"),
  title: "Kola | Online stores, orders and local delivery",
  description: "Create an online store, take structured orders and manage local delivery from one workspace.",
  openGraph: {
    title: "Kola | Your online store and delivery operations",
    description: "Create a storefront, take structured orders and coordinate local delivery.",
    images: [{ url: "/og-take-inspired.png", width: 1638, height: 960, alt: "Kola commerce and delivery platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kola | Online stores, orders and local delivery",
    description: "Create a storefront, take orders and coordinate local delivery.",
    images: ["/og-take-inspired.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
