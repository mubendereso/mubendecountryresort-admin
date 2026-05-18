import type { MetadataRoute } from "next";

// Icons are deliberately SVG-only for now — proper PNG variants (192px,
// 512px, maskable, apple-touch) need a real logo from the proprietors.
// Once that's in, run a one-off generator script and add PNG entries here.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mubende Country Resort Admin",
    short_name: "MCR Admin",
    description:
      "Property management for Mubende Country Resort — front desk, housekeeping, reservations, and guest records.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f4ec",
    theme_color: "#646b54",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
