import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

export const metadata: Metadata = {
  title: {
    default: "Mubende Country Resort Admin",
    template: "%s | Mubende Country Resort Admin"
  },
  description: "Operational dashboard for Mubende Country Resort staff.",
  applicationName: "Mubende Country Resort Admin",
  appleWebApp: {
    capable: true,
    title: "MCR Admin",
    statusBarStyle: "default"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#646b54",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
