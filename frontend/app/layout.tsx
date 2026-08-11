import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { BackgroundFX } from "@/components/BackgroundFX";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://frontend-xxcode.vercel.app"),
  title: "GemHaven — confidential dig-to-earn on Base",
  description:
    "Pick a slot on the Motherlode wheel, Dig with ETH, and let Inco Lightning keep your choice encrypted until the draw is revealed.",
  applicationName: "GemHaven",
  openGraph: {
    title: "GemHaven",
    description: "A confidential dig-to-earn cavern on Base. Your pick stays hidden — even from the contract.",
    type: "website",
    images: [{ url: "/og-banner.png", width: 1792, height: 1024, alt: "GemHaven — a lamp-lit crystal cavern with faceted gem deposits" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GemHaven — confidential dig-to-earn on Base",
    description: "Pick a deposit, Dig with ETH, and let Inco Lightning keep your choice encrypted until the Motherlode is drawn.",
    images: ["/og-banner.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050608",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Skip link first in the DOM so keyboard users can bypass the header. */}
        <a
          href="#cavern"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-gem-teal/40 focus:bg-rock-deep focus:px-4 focus:py-2 focus:text-sm focus:text-gem-teal"
        >
          Skip to the Motherlode wheel
        </a>
        <BackgroundFX />
        <Providers>
          <Navbar />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
