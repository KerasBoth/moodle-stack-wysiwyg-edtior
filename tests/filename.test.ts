import { test } from "node:test";
import assert from "node:assert/strict";
import { fileNameFromTitle, numberedName } from "../lib/filename.ts";

test("file name from task title", () => {
  assert.equal(fileNameFromTitle("Kurvendiskussion potenzfunktion (negativ, verschiebung)"), "Kurvendiskussion-potenzfunktion-(negativ-verschiebung).xml");
  assert.equal(fileNameFromTitle("  Ableitung / Kettenregel  "), "Ableitung-Kettenregel.xml");
  assert.equal(fileNameFromTitle(""), "stack-aufgabe.xml");
  assert.equal(fileNameFromTitle("???"), "stack-aufgabe.xml");
  assert.equal(numberedName("kurve.xml", 2), "kurve-2.xml");
});
