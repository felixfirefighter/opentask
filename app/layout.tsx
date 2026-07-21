import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import type { ReactNode } from "react";

import pwaMetadata from "@/shared/design/pwa-metadata.json";
import { createPublicThemeBootstrapScript } from "@/shared/design/theme-color";
import { AppClientProviders } from "@/shared/presentation";

import "./globals.css";

const interfaceFont = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-interface",
  display: "swap",
  style: "normal",
  weight: "100 900",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
});

const editorialFont = localFont({
  src: "./fonts/EBGaramondVariable.woff2",
  variable: "--font-editorial",
  adjustFontFallback: "Times New Roman",
  display: "swap",
  preload: false,
  style: "normal",
  weight: "400 800",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  applicationName: "OpenTask",
  title: {
    default: "OpenTask",
    template: "%s · OpenTask",
  },
  description: "An open-source workspace for task and calendar planning with reviewable AI.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/opentask-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/opentask-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/opentask-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "OpenTask" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: pwaMetadata.lightThemeColor },
    { media: "(prefers-color-scheme: dark)", color: pwaMetadata.darkThemeColor },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${interfaceFont.variable} ${editorialFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="opentask-public-theme-bootstrap"
          strategy="beforeInteractive"
          data-public-theme-bootstrap=""
          dangerouslySetInnerHTML={{ __html: publicThemeBootstrap }}
        />
      </head>
      <body>
        <AppClientProviders>{children}</AppClientProviders>
      </body>
    </html>
  );
}

const publicThemeBootstrap = createPublicThemeBootstrapScript();
