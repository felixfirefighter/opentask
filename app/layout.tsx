import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

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
  src: "./fonts/NewsreaderVariable.woff2",
  variable: "--font-editorial",
  display: "swap",
  preload: false,
  style: "normal",
  weight: "200 800",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: {
    default: "OpenTask",
    template: "%s · OpenTask",
  },
  description: "An open-source workspace for task and calendar planning with reviewable AI.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${interfaceFont.variable} ${editorialFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          data-public-theme-bootstrap=""
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: publicThemeBootstrap }}
        />
      </head>
      <body>
        <AppClientProviders>{children}</AppClientProviders>
      </body>
    </html>
  );
}

const publicThemeBootstrap =
  '(()=>{const r=document.documentElement;let p="system";try{const s=localStorage.getItem("opentask-theme-preference");if(s==="light"||s==="dark"||s==="system")p=s}catch{}r.dataset.themePreference=p;r.dataset.theme=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p})()';
