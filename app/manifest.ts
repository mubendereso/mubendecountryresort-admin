import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mubende Country Resort Admin",
    short_name: "MCR Admin",
    description:
      "Property management for Mubende Country Resort - front desk, housekeeping, reservations, and guest records.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f4ec",
    theme_color: "#646b54",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/mcr-official-logo.png",
        sizes: "2000x2000",
        type: "image/png",
        purpose: "any"
      }
    ]
  };
}
