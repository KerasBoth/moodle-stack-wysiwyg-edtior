// Datenbanktests – laufen gegen SQLite und gegen einen echten PostgreSQL-Server (embedded-postgres).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { type Db, openPostgresDb, openSqliteDb } from "../lib/server/db.ts";
import {
  StoreError, countUsers, createCategory, createFile, createUser, dashboard, deleteCategory, deleteUser,
  getFile, listCategories, listFiles, login, logout, renameCategory, updateFile, userForToken,
} from "../lib/server/store.ts";
import { hashPassword, verifyPassword } from "../lib/server/password.ts";

const sample = readFileSync(`xml/${readdirSync("xml").find((x) => x.endsWith(".xml"))!}`, "utf8");
const QNAME = "Kurvendiskussion potenzfunktion (negativ, verschiebung)";
const status = (s: number) => (e: unknown) => e instanceof StoreError && e.status === s;

// ---- PostgreSQL für die Tests ------------------------------------------------------------------------

const PG_PORT = 54000 + Math.floor(Math.random() * 1000);
const pgDir = mkdtempSync(path.join(tmpdir(), "stack-pg-"));
const server = new EmbeddedPostgres({ databaseDir: pgDir, user: "stack", password: "stack", port: PG_PORT, persistent: false, onLog: () => {} });
let dbCounter = 0;
const opened: Db[] = [];

/** Neue, leere PostgreSQL-Datenbank. */
async function freshPgUrl(): Promise<string> {
  const name = `t${process.pid}_${dbCounter++}`;
  const admin = new pg.Client({ connectionString: `postgres://stack:stack@localhost:${PG_PORT}/postgres` });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  return `postgres://stack:stack@localhost:${PG_PORT}/${name}`;
}

before(async () => {
  await server.initialise();
  await server.start();
}, { timeout: 120_000 });

after(async () => {
  for (const d of opened) await d.close().catch(() => {});
  await server.stop();
  rmSync(pgDir, { recursive: true, force: true });
});

const DRIVERS: { name: string; open: () => Promise<Db> }[] = [
  { name: "SQLite", open: () => openSqliteDb(":memory:") },
  { name: "PostgreSQL", open: async () => openPostgresDb(await freshPgUrl()) },
];

test("password hashing", () => {
  const h = hashPassword("geheim123");
  assert.ok(verifyPassword("geheim123", h));
  assert.ok(!verifyPassword("geheim124", h));
});

for (const driver of DRIVERS) {
  describe(driver.name, () => {
    const open = async () => { const d = await driver.open(); opened.push(d); return d; };

    test("users and sessions", async () => {
      const db = await open();
      assert.equal(await countUsers(db), 0);
      const admin = await createUser(db, "admin", "geheim123", true);
      assert.equal(admin.isAdmin, true);
      await assert.rejects(createUser(db, "ADMIN", "geheim123", false), status(409));
      await assert.rejects(createUser(db, "x", "geheim123", false), StoreError);
      await assert.rejects(createUser(db, "bob", "kurz", false), StoreError);
      assert.equal(await login(db, "admin", "falsch"), null);
      const s = (await login(db, "Admin", "geheim123"))!;
      assert.equal((await userForToken(db, s.token))?.id, admin.id);
      assert.equal(await userForToken(db, "unsinn"), null);
      await logout(db, s.token);
      assert.equal(await userForToken(db, s.token), null);
      await assert.rejects(deleteUser(db, admin.id), /letzte Administrator/);
      const bob = await createUser(db, "bob", "geheim123", false);
      await deleteUser(db, bob.id);
      assert.equal(await countUsers(db), 1);
    });

    test("files, categories, conflicts and dashboard", async () => {
      const db = await open();
      const u = await createUser(db, "anna", "geheim123", false);
      const cat = await createCategory(db, "Analysis", u.id);
      await assert.rejects(createCategory(db, "analysis", u.id), status(409));
      await renameCategory(db, cat.id, "Analysis I");
      await assert.rejects(renameCategory(db, 9999, "X"), status(404));

      const f = await createFile(db, { name: "kurve", content: sample, categoryId: cat.id }, u.id);
      assert.equal(f.name, "kurve.xml");
      assert.deepEqual(f.questions, [QNAME]);
      assert.equal(f.updatedBy, "anna");
      assert.equal(f.size, sample.length);
      await assert.rejects(createFile(db, { name: "KURVE.xml", content: sample }, u.id), status(409));
      await assert.rejects(createFile(db, { name: "x.xml", content: "<quiz/>" }, u.id), /keine STACK-Aufgabe/);
      await assert.rejects(createFile(db, { name: "x.xml", content: "<quiz" }, u.id), /Ungültiges XML/);
      await assert.rejects(createFile(db, { name: "y.xml", content: sample, categoryId: 4711 }, u.id), status(404));

      // Paralleles Bearbeiten wird erkannt
      const edited = sample.replace(QNAME, "Neu");
      const f2 = await updateFile(db, f.id, { content: edited, baseUpdatedAt: f.updatedAt }, u.id);
      assert.deepEqual(f2.questions, ["Neu"]);
      await assert.rejects(updateFile(db, f.id, { content: sample, baseUpdatedAt: f.updatedAt }, u.id), status(409));
      await updateFile(db, f.id, { content: sample, baseUpdatedAt: f.updatedAt, force: true }, u.id);
      assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM file_versions"))!.n, 2);
      // Überschreiben über den Namen legt ebenfalls eine Version an
      await createFile(db, { name: "kurve.xml", content: edited, overwrite: true }, u.id);
      assert.deepEqual((await getFile(db, f.id)).questions, ["Neu"]);

      for (let i = 0; i < 7; i++) await createFile(db, { name: `a${i}`, content: sample, categoryId: cat.id }, u.id);
      await createFile(db, { name: "lose", content: sample }, u.id);
      const d = await dashboard(db, 4, 5);
      assert.equal(d.recent.length, 4);
      assert.equal(d.recent[0].name, "lose.xml");
      assert.equal(d.categories[0].name, "Analysis I");
      assert.equal(d.categories[0].fileCount, 8);
      assert.equal(d.categories[0].files.length, 5);
      assert.equal(d.uncategorized.fileCount, 1);
      assert.equal(d.totalFiles, 9);
      assert.equal((await listFiles(db, { search: "A3" })).length, 1);
      assert.equal((await listFiles(db, { search: "KURVENDISKUSSION" })).length, 8);
      assert.equal((await listFiles(db, { search: "50%" })).length, 0);
      assert.equal((await listFiles(db, { category: cat.id, limit: 2 })).length, 2);

      // Kategorie löschen: Dateien bleiben, ohne Kategorie
      await deleteCategory(db, cat.id);
      assert.equal((await getFile(db, f.id)).categoryId, null);
      assert.equal((await listFiles(db, { category: null })).length, 9);
      assert.deepEqual(await listCategories(db), []);
    });

    test("saves in quick succession always get a newer timestamp", async () => {
      const db = await open();
      const f = await createFile(db, { name: "k", content: sample }, null);
      let base = f.updatedAt;
      for (let i = 0; i < 5; i++) {
        const next = await updateFile(db, f.id, { content: sample.replace(QNAME, `V${i}`), baseUpdatedAt: base }, null);
        assert.ok(next.updatedAt > base);
        base = next.updatedAt;
      }
      // alter Stand wird zuverlässig als Konflikt erkannt
      await assert.rejects(updateFile(db, f.id, { content: sample, baseUpdatedAt: f.updatedAt }, null), status(409));
    });

    test("concurrent saves of the same file are serialized", async () => {
      const db = await open();
      const u = await createUser(db, "anna", "geheim123", false);
      const f = await createFile(db, { name: "k", content: sample }, u.id);
      // zwei Benutzer speichern gleichzeitig auf demselben Stand – genau einer gewinnt
      const results = await Promise.allSettled([
        updateFile(db, f.id, { content: sample.replace(QNAME, "A"), baseUpdatedAt: f.updatedAt }, u.id),
        updateFile(db, f.id, { content: sample.replace(QNAME, "B"), baseUpdatedAt: f.updatedAt }, u.id),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.ok(results.some((r) => r.status === "rejected" && status(409)(r.reason)));
    });
  });
}

test("legacy XML folder is imported once, admin from env (SQLite file)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stack-db-"));
  try {
    writeFileSync(path.join(dir, "alt.xml"), sample);
    const file = path.join(dir, "db", "test.db");
    let db = await openSqliteDb(file, { importDir: dir, admin: { username: "root", password: "geheim123" } });
    assert.equal((await listFiles(db))[0].categoryName, "Importiert");
    assert.ok(await login(db, "root", "geheim123"));
    await db.close();
    db = await openSqliteDb(file, { importDir: dir });
    assert.equal((await listFiles(db)).length, 1);
    await db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an existing SQLite database is moved into a new PostgreSQL database", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stack-mig-"));
  try {
    const file = path.join(dir, "stack-editor.db");
    const lite = await openSqliteDb(file);
    const u = await createUser(lite, "anna", "geheim123", true);
    const cat = await createCategory(lite, "Analysis", u.id);
    const f = await createFile(lite, { name: "kurve", content: sample, categoryId: cat.id }, u.id);
    await updateFile(lite, f.id, { content: sample.replace(QNAME, "Neu") }, u.id);
    await lite.close();

    writeFileSync(path.join(dir, "ignoriert.xml"), sample);
    const url = await freshPgUrl();
    const pgDb = await openPostgresDb(url, { migrateFromSqlite: file, importDir: dir });
    opened.push(pgDb);
    assert.ok(await login(pgDb, "anna", "geheim123"));
    const files = await listFiles(pgDb);
    assert.deepEqual(files.map((x) => [x.id, x.name, x.categoryName, x.questions[0]]), [[f.id, "kurve.xml", "Analysis", "Neu"]]);
    assert.equal((await pgDb.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM file_versions"))!.n, 1);
    // Sequenzen stehen hinter den übernommenen IDs
    const next = await createFile(pgDb, { name: "neu", content: sample }, u.id);
    assert.ok(next.id > f.id);
    // Zweiter Start: nichts wird doppelt übernommen
    const again = await openPostgresDb(url, { migrateFromSqlite: file, importDir: dir });
    opened.push(again);
    assert.equal((await listFiles(again)).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
