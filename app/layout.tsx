import type { Metadata } from "next";
import "./globals.css";
import { DialogProvider } from "@/components/Dialogs";
import { I18nProvider } from "@/components/I18nProvider";
import { getLocale, getMessages, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // Kein title.template: es wirkt nicht auf app/page.tsx (gleiches Segment); Seiten setzen den vollen Titel.
  return { title: t("common.appName"), description: t("common.appDescription") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          <DialogProvider>{children}</DialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
