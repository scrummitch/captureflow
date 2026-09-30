import { readThemeFromCookieHeader, THEME_INIT_HTML } from "@captureflow/ui";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
import { AnalyticsProvider } from "./analytics-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";
import "./material-symbols-subset.css";

const SITE_DESCRIPTION = "Screen recordings and screenshots shared by Flindev.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Flindev",
    template: "%s · Flindev",
  },
  description: SITE_DESCRIPTION,
  // Per AGPL-3.0 §7(b) this generator attribution is a required legal notice — downstream operators must keep it.
  generator: "CaptureFlow",
  icons: {
    // SVG first so the tab mark matches the navbar and follows the browser
    // theme; the .ico stays as the fallback for browsers that ignore SVG.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Flindev",
    title: "Flindev",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 3200,
        height: 1680,
        alt: "Flindev — recordings and screenshots",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Flindev",
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = readThemeFromCookieHeader((await headers()).get("cookie"));
  return (
    /* suppressHydrationWarning: data-theme above is the server's best guess,
       and the init script below corrects it before React ever sees it. */
    <html
      lang="en"
      data-theme={theme}
      className={inter.variable}
      suppressHydrationWarning
    >
      <body>
        {/* First thing in the body, so it resolves a "system" preference before
            anything paints. */}
        <div hidden dangerouslySetInnerHTML={{ __html: THEME_INIT_HTML }} />
        <AnalyticsProvider />
        {children}
        <a
          href="/legal"
          className="fixed bottom-2 left-3 z-50 rounded bg-canvas px-2 py-1 text-xs text-fg-muted hover:text-fg"
        >
          Source & licenses
        </a>
      </body>
    </html>
  );
}
