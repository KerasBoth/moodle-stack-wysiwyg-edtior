import type { Metadata } from "next";
import "./globals.css";
import { DialogProvider } from "@/components/Dialogs";

export const metadata: Metadata = {
  title: "STACK-Editor",
  description: "Editor für Moodle-STACK-Aufgaben mit Live-Vorschau",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body><DialogProvider>{children}</DialogProvider></body>
    </html>
  );
}
