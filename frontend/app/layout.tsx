import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { BackgroundFX } from "@/components/BackgroundFX";
import { Navbar } from "@/components/Navbar";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "GemHaven — confidential dig-to-earn on Base",
  description:
    "Pick a deposit on the cavern wall, Dig with ETH, and let Inco Lightning keep your choice encrypted until the Motherlode is drawn.",
  applicationName: "GemHaven",
  openGraph: {
    title: "GemHaven",
    description: "A confidential dig-to-earn cavern on Base. Your pick stays hidden — even from the contract.",
    type: "website",
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
          Skip to the cavern wall
        </a>
        <BackgroundFX />
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
