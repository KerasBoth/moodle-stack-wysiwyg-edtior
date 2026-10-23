import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOCALES, LocalizedError, type Locale, formatDate, formatDateTime, negotiateLocale, parseLocale, translateWith,
} from "../lib/i18n/index.ts";
import { translate, translateMsg } from "../lib/i18n/translate.ts";
import { MESSAGES } from "../lib/i18n/messages/index.ts";
import { StoreError } from "../lib/server/store.ts";

test("negotiateLocale: Cookie vor Accept-Language, sonst Deutsch", () => {
  assert.equal(negotiateLocale("fr", "de"), "fr");
  assert.equal(negotiateLocale(null, "fr-CH,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(negotiateLocale("xx", "pt-BR,sk;q=0.5"), "sk");
  assert.equal(negotiateLocale(null, null), "de");
  assert.equal(negotiateLocale(null, "pt"), "de");
  assert.equal(negotiateLocale(undefined, "en;q=0.2,it;q=0.8"), "it");
});

test("parseLocale: nur exakte Kleinschreibung", () => {
  assert.equal(parseLocale("EN"), null);
  assert.equal(parseLocale("it"), "it");
  assert.equal(parseLocale(""), null);
  assert.equal(parseLocale(null), null);
});

// Blätter eines Bereichs: Pfad → Text oder Plural-Objekt
type Leaf = string | Record<string, string>;
function isPlural(v: unknown): v is Record<string, string> {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).other === "string";
}
function leaves(obj: unknown, prefix = "", out = new Map<string, Leaf>()): Map<string, Leaf> {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPlural(v)) out.set(path, v as Leaf);
    else leaves(v, path, out);
  }
  return out;
}
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

test("Parität: gleiche Schlüssel, keine leeren Texte, gleiche Platzhalter", () => {
  const de = MESSAGES.de as unknown as Record<string, unknown>;
  for (const locale of LOCALES) {
    const msgs = MESSAGES[locale] as unknown as Record<string, unknown>;
    assert.deepEqual(Object.keys(msgs).sort(), Object.keys(de).sort(), `${locale}: Bereiche`);
    for (const area of Object.keys(de)) {
      const ref = leaves(de[area], area);
      const got = leaves(msgs[area], area);
      assert.deepEqual([...got.keys()].sort(), [...ref.keys()].sort(), `${locale}: Schlüssel in ${area}`);
      for (const [path, value] of got) {
        const refLeaf = ref.get(path)!;
        const refText = typeof refLeaf === "string" ? refLeaf : refLeaf.other;
        if (typeof refLeaf !== "string") {
          // Plural in de → auch hier Plural mit allen Formen, die die Sprache braucht („many“ fällt auf „other“ zurück)
          assert.ok(typeof value !== "string", `${locale}: ${path} muss Plural sein`);
          const needed = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.filter((c) => c !== "many");
          for (const c of needed) assert.ok(c in value, `${locale}: ${path} fehlt Pluralform ${c}`);
        }
        const forms = typeof value === "string" ? { text: value } : value;
        for (const [form, text] of Object.entries(forms)) {
          assert.ok(text.trim() !== "", `${locale}: ${path} (${form}) ist leer`);
          assert.deepEqual(placeholders(text), placeholders(refText), `${locale}: Platzhalter in ${path} (${form})`);
        }
      }
    }
  }
});

// Ein Objekt mit „other“ gilt als Plural-Blatt; es darf dann nur Pluralformen enthalten,
// sonst verschwänden Unterschlüssel stillschweigend.
test("Plural-Blätter enthalten nur Pluralformen", () => {
  const allowed = new Set(["zero", "one", "two", "few", "many", "other"]);
  const walk = (obj: unknown, path: string) => {
    if (typeof obj !== "object" || obj === null) return;
    if ("other" in obj) {
      for (const k of Object.keys(obj)) assert.ok(allowed.has(k), `${path}: „${k}“ ist keine Pluralform`);
      for (const v of Object.values(obj)) assert.equal(typeof v, "string", `${path}: Pluralform ist kein Text`);
      return;
    }
    for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
  };
  for (const locale of LOCALES) walk(MESSAGES[locale], locale);
});

test("Bündel: Client-Einstieg zieht keine Fremdsprachen", () => {
  for (const file of ["index.ts", "core.ts"]) {
    const src = readFileSync(new URL(`../lib/i18n/${file}`, import.meta.url), "utf8");
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => i.includes("messages") && i !== "./messages/de/index.ts"), [], file);
    assert.ok(!imports.includes("./translate.ts"), file);
  }
});

test("Rückfall: fehlende Sprache → Deutsch", () => {
  assert.equal(translateWith({ de: MESSAGES.de }, "sk", "common.save"), "Speichern");
  assert.equal(translateWith({ de: MESSAGES.de, sk: MESSAGES.sk }, "sk", "common.items", { count: 3 }), "3 položky");
});

test("Rückfall: leerer Text → Deutsch, unbekannter Schlüssel → Schlüssel", () => {
  const msgs = {
    ...MESSAGES,
    de: { ...MESSAGES.de, common: { ...MESSAGES.de.common, save: "Speichern" } },
    en: { ...MESSAGES.en, common: { ...MESSAGES.en.common, save: "  " } },
  };
  assert.equal(translateWith(msgs, "en", "common.save"), "Speichern");
  assert.equal(translate("en", "gibt.es.nicht" as never), "gibt.es.nicht");
  assert.equal(translate("en", "common" as never), "common");
});

test("Platzhalter: bekannte ersetzt, unbekannte bleiben", () => {
  const msgs = {
    ...MESSAGES,
    en: { ...MESSAGES.en, common: { ...MESSAGES.en.common, save: "Hi {name}, {other}" } },
  };
  assert.equal(translateWith(msgs, "en", "common.save", { name: "Anna" }), "Hi Anna, {other}");
});

test("Plural: Slowakisch drei Formen, Deutsch zwei", () => {
  assert.deepEqual(MESSAGES.sk.common.items, { one: "{count} položka", few: "{count} položky", other: "{count} položiek" });
  assert.deepEqual(MESSAGES.de.common.items, { one: "{count} Element", other: "{count} Elemente" });
  assert.equal(translate("sk", "common.items", { count: 1 }), "1 položka");
  assert.equal(translate("sk", "common.items", { count: 3 }), "3 položky");
  assert.equal(translate("sk", "common.items", { count: 5 }), "5 položiek");
  assert.equal(translate("de", "common.items", { count: 1 }), "1 Element");
  assert.equal(translate("de", "common.items", { count: 2 }), "2 Elemente");
  assert.equal(translate("de", "common.items"), "{count} Elemente");
});

test("Datumsformat je Sprache", () => {
  assert.ok(formatDate("de", "2026-10-22T10:00:00Z").includes("22.10.2026"));
  assert.ok(!formatDate("en", "2026-10-22T10:00:00Z").includes("22.10.2026"));
  assert.ok(formatDateTime("de", Date.parse("2026-10-22T10:00:00Z")).includes("22.10.2026"));
  for (const l of LOCALES as readonly Locale[]) assert.ok(formatDate(l, new Date()).length > 0);
  // Feste Zeitzone (Vorgabe Europe/Berlin), unabhängig von der Zeitzone des Rechners
  assert.ok(formatDate("de", "2026-10-22T23:30:00Z").includes("23.10.2026"));
  assert.ok(formatDate("de", "2026-10-22T23:30:00Z", "UTC").includes("22.10.2026"));
  assert.ok(formatDateTime("de", "2026-10-22T10:00:00Z").includes("12:00"));
});

test("LocalizedError: deutsche Meldung, Schlüssel und Status", () => {
  const e = new LocalizedError("common.items", { count: 2 }, 409);
  assert.equal(e.message, "2 Elemente");
  assert.deepEqual(e.msg, { key: "common.items", params: { count: 2 } });
  assert.equal(e.status, 409);
  assert.ok(e instanceof Error);
});

test("Bereiche eingebunden: login.title in allen Sprachen, de ≠ en", () => {
  for (const l of LOCALES) assert.notEqual(translate(l, "login.title"), "login.title", l);
  assert.notEqual(translate("de", "login.title"), translate("en", "login.title"));
});

test("Server-Meldung: Konflikt in der Sprache des Anfragenden, Datum erst beim Übersetzen formatiert", () => {
  const en = translate("en", "server.conflictBy", { by: "Anna", date: "2026-10-22T10:00:00Z" });
  assert.ok(en.includes("Anna"), en);
  assert.ok(!en.includes("geändert"), en);
  const msg = { key: "server.conflictBy", params: { by: "Anna", date: "2026-10-22T10:00:00Z" } } as const;
  assert.ok(translateMsg("de", msg).includes("22.10.2026"), translateMsg("de", msg));
  assert.ok(!translateMsg("en", msg).includes("22.10.2026"), translateMsg("en", msg));
  assert.ok(!translateMsg("en", msg).includes("2026-10-22T"), translateMsg("en", msg));
});

test("Parameter, die Meldungen sind, werden in derselben Sprache übersetzt", () => {
  const cause = { key: "lib.eval.divisionByZero" } as const;
  assert.equal(translate("en", "lib.at", { where: "{@a@}", error: cause }), "{@a@}: Division by 0");
  assert.equal(new LocalizedError("lib.at", { where: "x", error: cause }).message, "x: Division durch 0");
});

test("StoreError: Schlüssel, deutsche .message, Status und Zusatzfelder", () => {
  const e = new StoreError("server.fileExists", { name: "a.xml" }, 409, { exists: true });
  assert.ok(e instanceof LocalizedError);
  assert.equal(e.message, "a.xml existiert bereits");
  assert.equal(e.status, 409);
  assert.deepEqual(e.extra, { exists: true });
  assert.equal(translate("fr", e.msg.key, e.msg.params), "a.xml existe déjà");
  assert.equal(new StoreError("server.invalidRequest").status, 400);
});
