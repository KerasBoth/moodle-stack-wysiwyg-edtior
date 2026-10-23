import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOCALES, LocalizedError, type Locale, type MessageKey, type Msg, type Params, formatDate, formatDateTime,
  negotiateLocale, parseLocale, translateWith,
} from "../lib/i18n/index.ts";
import { translate, translateMsg } from "../lib/i18n/translate.ts";
import { MESSAGES } from "../lib/i18n/messages/index.ts";
import { StoreError } from "../lib/server/store.ts";
import {
  CASTEXT_BLOCKS, CATEGORIES, DOC_BY_NAME, FUNCTION_DOCS, STACK_JXG_DOCS, casTextBlockText, categoryLabel, docKey, docText,
} from "../lib/stack/docs.ts";
import { ANSWER_TESTS, answerTestText } from "../lib/stack/answertests.ts";

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

// ---- Funktionsreferenz und Antworttests (Task 8)

const translatorFor = (l: Locale) => (key: MessageKey | Msg, params?: Params) =>
  typeof key === "string" ? translate(l, key, params) : translateMsg(l, key);

test("Referenz: jede Funktion hat in jeder Sprache Beschreibung, Rückgabe und Kategorie", () => {
  const de = MESSAGES.de.reference;
  const docs = [...FUNCTION_DOCS, ...STACK_JXG_DOCS];
  // Schlüssel und Einträge passen genau zueinander (keine verwaisten Texte)
  assert.deepEqual(Object.keys(de.fn).sort(), docs.map((d) => docKey(d.name)).sort());
  assert.deepEqual(Object.keys(de.cat).sort(), [...CATEGORIES].sort());
  // „other“ würde den Bereich zum Plural machen
  for (const obj of [de.fn, de.cat, de.returns, de.casText, de.answerTests]) assert.ok(!("other" in obj));
  for (const l of LOCALES) {
    const t = translatorFor(l);
    for (const doc of docs) {
      const x = docText(doc, t);
      assert.ok(x.desc.trim() && !x.desc.startsWith("reference."), `${l}: ${doc.name} desc`);
      assert.ok(x.returns.trim() && !x.returns.startsWith("reference."), `${l}: ${doc.name} returns`);
      assert.ok(x.cat.trim() && !x.cat.startsWith("reference."), `${l}: ${doc.name} cat`);
    }
    for (const c of CATEGORIES) assert.ok(!categoryLabel(c, t).startsWith("reference."), `${l}: ${c}`);
  }
  // Fremdsprachen weichen vom Deutschen ab (Rauchtest, dass wirklich übersetzt wurde)
  for (const l of LOCALES.filter((x) => x !== "de")) {
    assert.notEqual(docText(DOC_BY_NAME.get("rand")!, translatorFor(l)).desc, docText(DOC_BY_NAME.get("rand")!, translatorFor("de")).desc, l);
  }
});

test("Referenz: Beispiele haben in allen Sprachen denselben Code-Anteil", () => {
  const codePart = (ex: string) => ex.split("\n").map((line) => line.split("→")[0]);
  for (const doc of [...FUNCTION_DOCS, ...STACK_JXG_DOCS]) {
    const de = docText(doc, translatorFor("de")).example;
    assert.equal(de === undefined, doc.example === undefined, doc.name);
    if (de === undefined) continue;
    assert.ok(!/\{(eg|except|internalOrder)\}/.test(de), `${doc.name}: Platzhalter übrig: ${de}`);
    for (const l of LOCALES) {
      const ex = docText(doc, translatorFor(l)).example!;
      assert.deepEqual(codePart(ex), codePart(de), `${l}: ${doc.name}`);
    }
  }
  assert.ok(docText(DOC_BY_NAME.get("rand")!, translatorFor("en")).example!.includes("e.g."));
});

test("Referenz: CASText-Blöcke übersetzt, Code der Vorlage bleibt", () => {
  for (const l of LOCALES) {
    const t = translatorFor(l);
    for (const b of CASTEXT_BLOCKS) {
      const x = casTextBlockText(b, t);
      assert.ok(x.detail.trim() && !x.detail.startsWith("reference."), `${l}: ${b.label} detail`);
      assert.ok(x.info.trim() && !x.info.startsWith("reference."), `${l}: ${b.label} info`);
      // Vorlage samt Feldnamen ist Inhalt: in jeder Sprache gleich
      assert.equal(x.insert, b.insert, `${l}: ${x.insert}`);
      assert.equal(x.label, b.label);
    }
    assert.ok(!t("reference.casTextHelp").startsWith("reference."), l);
  }
  const ifBlock = CASTEXT_BLOCKS.find((b) => b.label.startsWith("[[if"))!;
  assert.equal(casTextBlockText(ifBlock, translatorFor("en")).insert, '[[if test="${bed}"]]\n${}\n[[else]]\n\n[[/if]]');
});

test("Antworttests: Label und Beschreibung in jeder Sprache, Name unverändert", () => {
  assert.deepEqual(Object.keys(MESSAGES.de.reference.answerTests).sort(), ANSWER_TESTS.map((a) => a.name).sort());
  for (const l of LOCALES) {
    const t = translatorFor(l);
    for (const a of ANSWER_TESTS) {
      const x = answerTestText(a, t);
      assert.ok(x.label.startsWith(`${a.name} – `) && x.label.length > a.name.length + 3, `${l}: ${x.label}`);
      assert.ok(!x.label.includes("reference."), `${l}: ${x.label}`);
      assert.ok(x.description.trim() && !x.description.startsWith("reference."), `${l}: ${a.name}`);
      assert.equal(x.optionHint === undefined, !a.needsOptions, `${l}: ${a.name} optionHint`);
      if (x.optionHint !== undefined) assert.ok(!x.optionHint.startsWith("reference."), `${l}: ${a.name}`);
    }
  }
  assert.equal(answerTestText(ANSWER_TESTS[0], translatorFor("en")).label, "AlgEquiv – algebraically equivalent");
});
