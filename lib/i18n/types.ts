// Typen der Übersetzungstexte. Deutsch (messages/de) ist die Quelle; alle anderen Sprachen
// müssen per `satisfies Messages[…]` dieselben Schlüssel haben.

import type de from "./messages/de/index.ts";

// Pluralformen nach Intl.PluralRules; „other“ ist Pflicht und Rückfall.
// Ein Objekt mit dem Schlüssel „other“ gilt deshalb immer als Plural-Blatt, nie als Unterbereich.
export type Plural = { one?: string; few?: string; many?: string; other: string };
export type Params = Record<string, string | number>;

type DeMessages = typeof de;

// Jedes Blatt darf in einer Übersetzung Text oder Plural sein.
type Widen<T> = T extends string
  ? string | Plural
  : T extends { other: string }
    ? string | Plural
    : { [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<DeMessages>;

// Punkt-Pfade aller Blätter von de, z. B. "common.save"
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends { other: string }
      ? K
      : `${K}.${Paths<T[K]>}`;
}[keyof T & string];
export type MessageKey = Paths<DeMessages>;

export type Msg = { key: MessageKey; params?: Params };
