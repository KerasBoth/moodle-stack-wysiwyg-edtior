import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STACK-Editor",
  description: "Editor für Moodle-STACK-Aufgaben mit Live-Vorschau",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
