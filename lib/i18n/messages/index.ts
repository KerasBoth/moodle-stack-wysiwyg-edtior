// Alle Übersetzungen je Sprache. Deutsch ist Quelle und Rückfall.

import type { Locale } from "../locales.ts";
import type { Messages } from "../types.ts";
import de from "./de/index.ts";
import en from "./en/index.ts";
import es from "./es/index.ts";
import fr from "./fr/index.ts";
import it from "./it/index.ts";
import sk from "./sk/index.ts";

export const MESSAGES = { de, en, fr, es, it, sk } satisfies Record<Locale, Messages>;
