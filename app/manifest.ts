import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Actually Open Snow",
    short_name: "Open Snow",
    description: "An open-data ski/snow forecast app for Northern Utah & Southeast Idaho — resorts and backcountry.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#020617",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
