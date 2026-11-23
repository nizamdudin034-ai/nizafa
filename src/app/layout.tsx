import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SiteFooter from "@/components/SiteFooter";
import ThemeScript from "@/components/ThemeScript";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Nizafa — YouTube SEO & Growth Tool",
  description:
    "Nizafa helps YouTube creators grow: SEO packs, keyword research, channel audits, trending topics, thumbnail studio, and best time to post — from live public data and the YouTube Data API.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b4f46",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <PwaRegister />
        <Nav />
        <main className="container">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
