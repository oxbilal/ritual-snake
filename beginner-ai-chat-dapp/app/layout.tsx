import type { Metadata } from "next";
import { Providers } from "../components/Providers";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ritual Snake",
  description: "A gas-only Snake game for Ritual Testnet.",
  openGraph: {
    title: "Ritual Snake",
    description: "A gas-only Snake game for Ritual Testnet.",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ritual Snake",
    description: "A gas-only Snake game for Ritual Testnet.",
    images: ["/api/og"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;900&family=Barlow:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
