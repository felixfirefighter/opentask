import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppClientProviders } from "@/shared/presentation";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OpenTask",
    template: "%s · OpenTask",
  },
  description: "An open-source workspace for task and calendar planning with reviewable AI.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
