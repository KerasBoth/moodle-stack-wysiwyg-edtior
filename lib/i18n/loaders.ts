// Texte einer Sprache nachladen (Browser): jede Fremdsprache ist ein eigener Chunk, Deutsch ist ohnehin im Bündel.

import type { Locale } from "./locales.ts";
import type { Messages } from "./types.ts";

const LOADERS: Record<Locale, () => Promise<{ default: Messages }>> = {
  de: () => import("./messages/de/index.ts"),
  en: () => import("./messages/en/index.ts"),
  fr: () => import("./messages/fr/index.ts"),
  es: () => import("./messages/es/index.ts"),
  it: () => import("./messages/it/index.ts"),
  sk: () => import("./messages/sk/index.ts"),
};

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await LOADERS[locale]()).default;
}
