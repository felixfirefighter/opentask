import type { MetadataRoute } from "next";

import pwaMetadata from "@/shared/design/pwa-metadata.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OpenTask",
    short_name: "OpenTask",
    description: "Open-source personal planning for tasks, time, habits, Focus, and reviewable AI proposals.",
    lang: "en",
    dir: "ltr",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: pwaMetadata.backgroundColor,
    theme_color: pwaMetadata.lightThemeColor,
    categories: ["productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/opentask-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/opentask-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/opentask-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
