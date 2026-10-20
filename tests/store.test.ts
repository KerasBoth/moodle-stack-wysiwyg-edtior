// Datenbanktests – laufen gegen SQLite und gegen einen echten PostgreSQL-Server (embedded-postgres).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import Database from "better-sqlite3";
import { type Db, POSTGRES_MIGRATIONS, SQLITE_MIGRATIONS, openPostgresDb, openSqliteDb } from "../lib/server/db.ts";
import {
  StoreError, type ShareRole, countUsers, createCategory, createFile, createUser, dashboard, deleteCategory, deleteFile, deleteUser,
  getFile, listCategories, listFiles, listPeople, listShares, listUsers, login, logout, removeShare, renameCategory, setShare, setUserNames,
  updateFile, userForToken,
} from "../lib/server/store.ts";
import { personLabel, personName } from "../lib/people.ts";
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
      assert.deepEqual((await listUsers(db)).map((u) => [u.fileCount, u.categoryCount]), [[0, 0]]);
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

    test("user names and people directory", async () => {
      const db = await open();
      const a = await createUser(db, "admin", "geheim123", true, { firstName: " Anna ", lastName: "Schmidt" });
      assert.equal(a.firstName, "Anna");
      const b = await createUser(db, "bob", "geheim123", false);
      assert.equal(personName(b), "bob");
      assert.equal(personLabel(a), "Anna Schmidt (admin)");
      await setUserNames(db, b.id, "Bob", "Meier");
      assert.deepEqual((await listPeople(db, a.id)).map((p) => p.username), ["bob"]);
      await assert.rejects(setUserNames(db, 9999, "X", "Y"), status(404));
      await assert.rejects(setUserNames(db, b.id, "x".repeat(81), ""), status(400));
      await assert.rejects(createUser(db, "carl", "geheim123", false, { lastName: "y".repeat(81) }), status(400));
    });

    test("files, categories, conflicts and dashboard", async () => {
      const db = await open();
      const u = await createUser(db, "anna", "geheim123", false);
      const cat = await createCategory(db, "Analysis", u.id);
      await assert.rejects(createCategory(db, "analysis", u.id), status(409));
      await renameCategory(db, u.id, cat.id, "Analysis I");
      await assert.rejects(renameCategory(db, u.id, 9999, "X"), status(404));

      const f = await createFile(db, { name: "kurve", content: sample, categoryId: cat.id }, u.id);
      assert.equal(f.name, "kurve.xml");
      assert.deepEqual(f.questions, [QNAME]);
      assert.equal(f.updatedBy, "anna");
      assert.equal(f.role, "owner");
      assert.equal(f.size, sample.length);
      await assert.rejects(createFile(db, { name: "KURVE.xml", content: sample }, u.id), status(409));
      await assert.rejects(createFile(db, { name: "x.xml", content: "<quiz/>" }, u.id), /keine STACK-Aufgabe/);
      await assert.rejects(createFile(db, { name: "x.xml", content: "<quiz" }, u.id), /Ungültiges XML/);
      await assert.rejects(createFile(db, { name: "y.xml", content: sample, categoryId: 4711 }, u.id), status(404));

      // Paralleles Bearbeiten wird erkannt
      const edited = sample.replace(QNAME, "Neu");
      const f2 = await updateFile(db, u.id, f.id, { content: edited, baseUpdatedAt: f.updatedAt });
      assert.deepEqual(f2.questions, ["Neu"]);
      await assert.rejects(updateFile(db, u.id, f.id, { content: sample, baseUpdatedAt: f.updatedAt }), status(409));
      await updateFile(db, u.id, f.id, { content: sample, baseUpdatedAt: f.updatedAt, force: true });
      assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM file_versions"))!.n, 2);
      // Überschreiben über den Namen legt ebenfalls eine Version an
      await createFile(db, { name: "kurve.xml", content: edited, overwrite: true }, u.id);
      assert.deepEqual((await getFile(db, u.id, f.id)).questions, ["Neu"]);

      for (let i = 0; i < 7; i++) await createFile(db, { name: `a${i}`, content: sample, categoryId: cat.id }, u.id);
      await createFile(db, { name: "lose", content: sample }, u.id);
      const d = await dashboard(db, u.id, 4, 5);
      assert.equal(d.recent.length, 4);
      assert.equal(d.recent[0].name, "lose.xml");
      assert.equal(d.categories[0].name, "Analysis I");
      assert.equal(d.categories[0].fileCount, 8);
      assert.equal(d.categories[0].files.length, 5);
      assert.equal(d.uncategorized.fileCount, 1);
      assert.equal(d.totalFiles, 9);
      assert.equal((await listFiles(db, u.id, { search: "A3" })).length, 1);
      assert.equal((await listFiles(db, u.id, { search: "KURVENDISKUSSION" })).length, 8);
      assert.equal((await listFiles(db, u.id, { search: "50%" })).length, 0);
      assert.equal((await listFiles(db, u.id, { category: cat.id, limit: 2 })).length, 2);

      // Kategorie löschen: Dateien bleiben, ohne Kategorie
      await deleteCategory(db, u.id, cat.id);
      assert.equal((await getFile(db, u.id, f.id)).categoryId, null);
      assert.equal((await listFiles(db, u.id, { category: null })).length, 9);
      assert.deepEqual(await listCategories(db, u.id), []);
    });

    test("users only see their own files and categories", async () => {
      const db = await open();
      const anna = await createUser(db, "anna", "geheim123", false);
      const bob = await createUser(db, "bob", "geheim123", false);
      const ca = await createCategory(db, "Analysis", anna.id);
      const cb = await createCategory(db, "Analysis", bob.id);           // gleicher Name, anderer Besitzer: erlaubt
      const fa = await createFile(db, { name: "kurve", content: sample, categoryId: ca.id }, anna.id);
      const fb = await createFile(db, { name: "kurve", content: sample }, bob.id);  // gleicher Dateiname: erlaubt
      assert.notEqual(fa.id, fb.id);
      assert.equal(fa.role, "owner");
      assert.equal(fa.ownerName, "anna");

      assert.deepEqual((await listFiles(db, bob.id)).map((f) => f.id), [fb.id]);
      assert.deepEqual((await listCategories(db, bob.id)).map((c) => c.id), [cb.id]);
      assert.equal((await listFiles(db, bob.id, { search: "kurve" })).length, 1);
      await assert.rejects(getFile(db, bob.id, fa.id), status(404));
      await assert.rejects(updateFile(db, bob.id, fa.id, { content: sample }), status(404));
      await assert.rejects(deleteFile(db, bob.id, fa.id), status(404));
      await assert.rejects(renameCategory(db, bob.id, ca.id, "X"), status(404));
      await assert.rejects(deleteCategory(db, bob.id, ca.id), status(404));
      await assert.rejects(updateFile(db, bob.id, fb.id, { categoryId: ca.id }), status(404));   // fremde Kategorie
      await assert.rejects(createFile(db, { name: "y", content: sample, categoryId: ca.id }, bob.id), status(404));

      // overwrite über den Namen trifft nur eigene Dateien
      await createFile(db, { name: "kurve", content: sample.replace(QNAME, "Bob"), overwrite: true }, bob.id);
      assert.deepEqual((await getFile(db, anna.id, fa.id)).questions, [QNAME]);

      const d = await dashboard(db, bob.id);
      assert.equal(d.totalFiles, 1);
      assert.deepEqual(d.categories.map((c) => c.id), [cb.id]);

      // Benutzer löschen kaskadiert
      await deleteUser(db, anna.id);
      assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM files WHERE id = $1", [fa.id]))!.n, 0);
      assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM categories WHERE id = $1", [ca.id]))!.n, 0);
    });

    test("shared files are listed with their role and stay read-only", async () => {
      const db = await open();
      const anna = await createUser(db, "anna", "geheim123", false, { firstName: "Anna", lastName: "Schmidt" });
      const bob = await createUser(db, "bob", "geheim123", false);
      const ca = await createCategory(db, "Analysis", anna.id);
      const fa = await createFile(db, { name: "kurve", content: sample, categoryId: ca.id }, anna.id);
      const fb = await createFile(db, { name: "eigen", content: sample }, bob.id);
      await db.run("INSERT INTO file_shares (file_id, user_id, role, created_at) VALUES ($1, $2, 'read', $3)", [fa.id, bob.id, "t"]);

      assert.deepEqual((await listFiles(db, bob.id, { scope: "shared" })).map((f) => f.id), [fa.id]);
      assert.deepEqual((await listFiles(db, bob.id, { scope: "own" })).map((f) => f.id), [fb.id]);
      assert.equal((await listFiles(db, bob.id)).length, 2);
      assert.equal((await listFiles(db, bob.id, { category: ca.id })).length, 0);
      const shared = await getFile(db, bob.id, fa.id);
      assert.equal(shared.role, "read");
      assert.equal(shared.ownerName, "Anna Schmidt");
      assert.equal(shared.categoryName, null);
      assert.equal((await dashboard(db, bob.id)).recent.length, 2);
      assert.equal((await dashboard(db, bob.id)).totalFiles, 1);
      await assert.rejects(updateFile(db, bob.id, fa.id, { content: sample }), status(403));
      await assert.rejects(deleteFile(db, bob.id, fa.id), status(403));
    });

    test("sharing with read and edit rights", async () => {
      const db = await open();
      const anna = await createUser(db, "anna", "geheim123", false, { firstName: "Anna", lastName: "Schmidt" });
      const bob = await createUser(db, "bob", "geheim123", false);
      const carl = await createUser(db, "carl", "geheim123", false);
      const cat = await createCategory(db, "A", anna.id);
      const f = await createFile(db, { name: "kurve", content: sample, categoryId: cat.id }, anna.id);

      await setShare(db, anna.id, f.id, bob.id, "read");
      const seen = (await listFiles(db, bob.id, { scope: "shared" }))[0];
      assert.equal(seen.role, "read");
      assert.equal(seen.ownerName, "Anna Schmidt");
      assert.equal((await listFiles(db, bob.id, { search: "kurve" })).length, 1);
      assert.equal((await listCategories(db, bob.id)).length, 0);
      assert.equal((await getFile(db, bob.id, f.id)).content, sample);
      await assert.rejects(updateFile(db, bob.id, f.id, { content: sample.replace(QNAME, "X") }), status(403));

      await setShare(db, anna.id, f.id, bob.id, "edit");              // Stufe ändern
      const saved = await updateFile(db, bob.id, f.id, { content: sample.replace(QNAME, "X"), baseUpdatedAt: f.updatedAt });
      assert.equal(saved.updatedBy, "bob");
      await assert.rejects(updateFile(db, bob.id, f.id, { content: sample, baseUpdatedAt: f.updatedAt }), status(409)); // Konflikterkennung
      await assert.rejects(updateFile(db, bob.id, f.id, { name: "neu" }), status(403));
      await assert.rejects(updateFile(db, bob.id, f.id, { categoryId: null }), status(403));
      await assert.rejects(deleteFile(db, bob.id, f.id), status(403));
      await assert.rejects(setShare(db, bob.id, f.id, carl.id, "read"), status(403));
      await assert.rejects(listShares(db, carl.id, f.id), status(404));
      await assert.rejects(setShare(db, anna.id, f.id, anna.id, "read"), status(400));
      await assert.rejects(setShare(db, anna.id, f.id, 9999, "read"), status(404));
      await assert.rejects(setShare(db, anna.id, f.id, carl.id, "admin" as ShareRole), status(400));
      await assert.rejects(removeShare(db, anna.id, f.id, carl.id), status(404));
      // eigener gleichnamiger Upload des Empfängers berührt das Original nicht
      await createFile(db, { name: "kurve", content: sample, overwrite: true }, bob.id);
      assert.deepEqual((await getFile(db, anna.id, f.id)).questions, ["X"]);

      assert.deepEqual((await listShares(db, anna.id, f.id)).map((s) => [s.username, s.role]), [["bob", "edit"]]);
      assert.deepEqual((await dashboard(db, bob.id)).shared.map((x) => x.id), [f.id]);

      await removeShare(db, anna.id, f.id, bob.id);
      await assert.rejects(getFile(db, bob.id, f.id), status(404));
      await assert.rejects(updateFile(db, bob.id, f.id, { content: sample }), status(404));

      // Kaskaden
      await setShare(db, anna.id, f.id, carl.id, "read");
      await deleteUser(db, carl.id);
      assert.deepEqual(await listShares(db, anna.id, f.id), []);
      await setShare(db, anna.id, f.id, bob.id, "read");
      await deleteFile(db, anna.id, f.id);
      assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM file_shares"))!.n, 0);
    });

    test("saves in quick succession always get a newer timestamp", async () => {
      const db = await open();
      const u = await createUser(db, "anna", "geheim123", false);
      const f = await createFile(db, { name: "k", content: sample }, u.id);
      let base = f.updatedAt;
      for (let i = 0; i < 5; i++) {
        const next = await updateFile(db, u.id, f.id, { content: sample.replace(QNAME, `V${i}`), baseUpdatedAt: base });
        assert.ok(next.updatedAt > base);
        base = next.updatedAt;
      }
      // alter Stand wird zuverlässig als Konflikt erkannt
      await assert.rejects(updateFile(db, u.id, f.id, { content: sample, baseUpdatedAt: f.updatedAt }), status(409));
    });

    test("concurrent saves of the same file are serialized", async () => {
      const db = await open();
      const u = await createUser(db, "anna", "geheim123", false);
      const f = await createFile(db, { name: "k", content: sample }, u.id);
      // zwei Benutzer speichern gleichzeitig auf demselben Stand – genau einer gewinnt
      const results = await Promise.allSettled([
        updateFile(db, u.id, f.id, { content: sample.replace(QNAME, "A"), baseUpdatedAt: f.updatedAt }),
        updateFile(db, u.id, f.id, { content: sample.replace(QNAME, "B"), baseUpdatedAt: f.updatedAt }),
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
    const root = (await login(db, "root", "geheim123"))!;
    assert.equal((await listFiles(db, root.user.id))[0].categoryName, "Importiert");
    await db.close();
    db = await openSqliteDb(file, { importDir: dir });
    assert.equal((await listFiles(db, root.user.id)).length, 1);
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
    await updateFile(lite, u.id, f.id, { content: sample.replace(QNAME, "Neu") });
    await lite.close();

    writeFileSync(path.join(dir, "ignoriert.xml"), sample);
    const url = await freshPgUrl();
    const pgDb = await openPostgresDb(url, { migrateFromSqlite: file, importDir: dir });
    opened.push(pgDb);
    assert.ok(await login(pgDb, "anna", "geheim123"));
    const files = await listFiles(pgDb, u.id);
    assert.deepEqual(files.map((x) => [x.id, x.name, x.categoryName, x.questions[0]]), [[f.id, "kurve.xml", "Analysis", "Neu"]]);
    assert.equal((await pgDb.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM file_versions"))!.n, 1);
    // Sequenzen stehen hinter den übernommenen IDs
    const next = await createFile(pgDb, { name: "neu", content: sample }, u.id);
    assert.ok(next.id > f.id);
    // Zweiter Start: nichts wird doppelt übernommen
    const again = await openPostgresDb(url, { migrateFromSqlite: file, importDir: dir });
    opened.push(again);
    assert.equal((await listFiles(again, u.id)).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Migration 2: Besitzer zuordnen -------------------------------------------------------------------

const V1_DATA = [
  "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (1, 'admin', 'x', 1, 't')",
  "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (2, 'bob', 'x', 0, 't')",
  "INSERT INTO categories (id, name, created_by, created_at) VALUES (1, 'Analysis', 2, 't')",
  "INSERT INTO files (id, name, content, category_id, created_by, created_at, updated_at) VALUES (1, 'kurve.xml', '<quiz/>', 1, 2, 't', 't')",
  "INSERT INTO file_versions (id, file_id, content, saved_by, saved_at) VALUES (1, 1, '<quiz/>', 2, 't')",
  "INSERT INTO files (id, name, content, created_by, created_at, updated_at) VALUES (2, 'alt.xml', '<quiz/>', NULL, 't', 't')",
];

/** Legt eine SQLite-Datei mit Schema v1 und Daten von Hand an (ohne openSqliteDb, damit sie v1 bleibt). */
function makeV1Sqlite(file: string) {
  const raw = new Database(file);
  raw.pragma("foreign_keys = ON");
  raw.exec(SQLITE_MIGRATIONS[0]);
  raw.pragma("user_version = 1");
  for (const sql of V1_DATA) raw.exec(sql);
  raw.close();
}

async function assertOwnedByAdmin(db: Db) {
  const owners = await db.query<{ name: string; owner_id: number }>("SELECT name, owner_id FROM files ORDER BY name");
  assert.deepEqual(owners.map((r) => r.owner_id), [1, 1]);
  assert.equal((await db.get<{ owner_id: number }>("SELECT owner_id FROM categories"))!.owner_id, 1);
  assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM file_versions"))!.n, 1);
}

test("migration 2 gives all existing data to the first admin and keeps versions (SQLite file)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stack-m2-"));
  try {
    const file = path.join(dir, "v1.db");
    makeV1Sqlite(file);
    const db = await openSqliteDb(file);
    await assertOwnedByAdmin(db);
    assert.deepEqual(await db.query("PRAGMA foreign_key_check"), []);
    await db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migration 2 on PostgreSQL gives all existing data to the first admin", async () => {
  const url = await freshPgUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("CREATE TABLE schema_version (version INTEGER NOT NULL)");
  await client.query(POSTGRES_MIGRATIONS[0]);
  await client.query("INSERT INTO schema_version (version) VALUES (1)");
  for (const sql of V1_DATA) await client.query(sql);
  await client.end();
  const db = await openPostgresDb(url);
  opened.push(db);
  await assertOwnedByAdmin(db);
});

test("legacy import before any user exists is claimed by the first admin", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stack-db-"));
  try {
    writeFileSync(path.join(dir, "alt.xml"), sample);
    const withAdmin = await openSqliteDb(path.join(dir, "db", "a.db"), { importDir: dir, admin: { username: "root", password: "geheim123" } });
    const root = await login(withAdmin, "root", "geheim123");
    const files = await withAdmin.query<{ owner_id: number }>("SELECT owner_id FROM files");
    assert.equal(files.length, 1);
    assert.ok(files.every((f) => f.owner_id === root!.user.id));
    await withAdmin.close();

    const noAdmin = await openSqliteDb(path.join(dir, "db", "b.db"), { importDir: dir });
    assert.ok((await noAdmin.query<{ owner_id: number | null }>("SELECT owner_id FROM files")).every((f) => f.owner_id === null));
    assert.equal((await noAdmin.get<{ owner_id: number | null }>("SELECT owner_id FROM categories"))!.owner_id, null);
    const created = await createUser(noAdmin, "root", "geheim123", true);
    assert.ok((await noAdmin.query<{ owner_id: number }>("SELECT owner_id FROM files")).every((f) => f.owner_id === created.id));
    assert.equal((await noAdmin.get<{ owner_id: number }>("SELECT owner_id FROM categories"))!.owner_id, created.id);
    await noAdmin.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a schema-v1 SQLite file copied into PostgreSQL ends up owned by the admin", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stack-m2pg-"));
  try {
    const file = path.join(dir, "v1.db");
    makeV1Sqlite(file);
    const db = await openPostgresDb(await freshPgUrl(), { migrateFromSqlite: file });
    opened.push(db);
    await assertOwnedByAdmin(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
