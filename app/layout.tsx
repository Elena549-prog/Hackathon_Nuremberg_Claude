import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Busplaner Nürnberg",
  description: "Dienstplanung für Busfahrer auf Basis von Fahrplan und Verkehrslage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
