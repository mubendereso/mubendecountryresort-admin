import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mubende Country Resort Admin",
    short_name: "MCR Admin",
    description:
      "Property management for Mubende Country Resort - front desk, housekeeping, reservations, and guest records.",
    start_url: "/login?next=%2Fdashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f4ec",
    theme_color: "#646b54",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/mcr-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/mcr-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/mcr-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
