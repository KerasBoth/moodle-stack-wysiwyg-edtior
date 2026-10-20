// Datenbank für Benutzer, Sitzungen, Kategorien und XML-Dateien.
//   DATABASE_URL=postgres://…  → PostgreSQL (Docker: eigener Container im internen Netz)
//   ohne DATABASE_URL          → SQLite-Datei in STACK_DATA_DIR (Standard ./data), z. B. für die lokale Entwicklung
// Beim ersten Start mit leerer PostgreSQL-Datenbank wird eine vorhandene SQLite-Datei übernommen.

import { existsSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { type Db, openPostgres, openSqlite } from "./sql.ts";
import { hashPassword } from "./password.ts";
import { describeXml } from "./xmlmeta.ts";

export type { Db } from "./sql.ts";

// ---- Schema ------------------------------------------------------------------------------------------

const SQLITE_MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE files (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    content        TEXT NOT NULL,
    category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    question_names TEXT NOT NULL DEFAULT '[]',
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX files_updated ON files(updated_at DESC);
  CREATE INDEX files_category ON files(category_id, updated_at DESC);
  CREATE TABLE file_versions (
    id       INTEGER PRIMARY KEY,
    file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    content  TEXT NOT NULL,
    saved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    saved_at TEXT NOT NULL
  );
  CREATE INDEX file_versions_file ON file_versions(file_id, id DESC);
  `,
];

const POSTGRES_MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE UNIQUE INDEX users_username ON users (lower(username));
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE categories (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX categories_name ON categories (lower(name));
  CREATE TABLE files (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    content        TEXT NOT NULL,
    category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    question_names TEXT NOT NULL DEFAULT '[]',
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE UNIQUE INDEX files_name ON files (lower(name));
  CREATE INDEX files_updated ON files (updated_at DESC);
  CREATE INDEX files_category ON files (category_id, updated_at DESC);
  CREATE TABLE file_versions (
    id       SERIAL PRIMARY KEY,
    file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    content  TEXT NOT NULL,
    saved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    saved_at TEXT NOT NULL
  );
  CREATE INDEX file_versions_file ON file_versions (file_id, id DESC);
  `,
];

/** Führt fehlende Migrationen aus; liefert true, wenn die Datenbank gerade neu angelegt wurde. */
async function migrate(db: Db): Promise<boolean> {
  if (db.dialect === "sqlite") {
    const raw = (db as unknown as { raw(): import("better-sqlite3").Database }).raw();
    const version = raw.pragma("user_version", { simple: true }) as number;
    for (let v = version; v < SQLITE_MIGRATIONS.length; v++) {
      await db.tx(async (t) => {
        await t.exec(SQLITE_MIGRATIONS[v]);
        await t.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
    return version === 0;
  }
  // Mehrere App-Instanzen gleichzeitig: Migration per Advisory-Lock serialisieren
  return db.tx(async (t) => {
    await t.exec("SELECT pg_advisory_xact_lock(827364501)");
    await t.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
    const row = await t.get<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_version");
    const version = row?.v ?? 0;
    for (let v = version; v < POSTGRES_MIGRATIONS.length; v++) {
      await t.exec(POSTGRES_MIGRATIONS[v]);
      await t.run("INSERT INTO schema_version (version) VALUES ($1)", [v + 1]);
    }
    return version === 0;
  });
}

// ---- Erstbefüllung ------------------------------------------------------------------------------------

export interface OpenOptions {
  /** Ordner mit alten XML-Dateien, die beim Anlegen der Datenbank importiert werden. */
  importDir?: string;
  /** Erstes Administratorkonto, falls noch kein Benutzer existiert. */
  admin?: { username: string; password: string };
  /** SQLite-Datei, deren Inhalt in eine neue PostgreSQL-Datenbank übernommen wird. */
  migrateFromSqlite?: string;
}

/** Übernimmt vorhandene *.xml aus dem früheren Aufgabenordner in die Kategorie „Importiert“. */
async function importLegacyXml(db: Db, dir: string) {
  if (!existsSync(dir)) return;
  const names = readdirSync(dir).filter((f) => /\.xml$/i.test(f) && !f.startsWith("."));
  if (!names.length) return;
  const now = new Date().toISOString();
  await db.tx(async (t) => {
    const cat = await t.get<{ id: number }>("INSERT INTO categories (name, created_at) VALUES ('Importiert', $1) RETURNING id", [now]);
    for (const name of names) {
      const content = readFileSync(path.join(dir, name), "utf8");
      const meta = describeXml(content);
      const exists = await t.get("SELECT 1 FROM files WHERE lower(name) = lower($1)", [name]);
      if (exists) continue;
      const ts = new Date().toISOString();
      await t.run(
        `INSERT INTO files (name, content, category_id, question_names, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, content, cat!.id, JSON.stringify(meta.ok ? meta.questions : []), ts, ts],
      );
    }
  });
}

const COPY_TABLES: { table: string; columns: string[] }[] = [
  { table: "users", columns: ["id", "username", "password_hash", "is_admin", "created_at"] },
  { table: "sessions", columns: ["token_hash", "user_id", "expires_at"] },
  { table: "categories", columns: ["id", "name", "created_by", "created_at"] },
  { table: "files", columns: ["id", "name", "content", "category_id", "question_names", "created_by", "updated_by", "created_at", "updated_at"] },
  { table: "file_versions", columns: ["id", "file_id", "content", "saved_by", "saved_at"] },
];

/** Kopiert alle Daten einer SQLite-Datei in die (leere) PostgreSQL-Datenbank. Liefert die Anzahl der Aufgaben. */
async function copyFromSqlite(db: Db, file: string): Promise<number> {
  const src = openSqlite(file, { readonly: true });
  try {
    let files = 0;
    await db.tx(async (t) => {
      for (const { table, columns } of COPY_TABLES) {
        const rows = await src.query<Record<string, unknown>>(`SELECT ${columns.join(", ")} FROM ${table}`);
        if (table === "files") files = rows.length;
        const ph = columns.map((_, i) => `$${i + 1}`).join(", ");
        for (const row of rows) await t.run(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${ph})`, columns.map((c) => row[c]));
        if (columns[0] === "id") {
          await t.exec(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
        }
      }
    });
    return files;
  } finally {
    await src.close();
  }
}

export async function initDb(db: Db, opts: OpenOptions = {}): Promise<Db> {
  const fresh = await migrate(db);
  if (fresh) {
    let migrated = false;
    if (db.dialect === "postgres" && opts.migrateFromSqlite && existsSync(opts.migrateFromSqlite)) {
      try {
        const n = await copyFromSqlite(db, opts.migrateFromSqlite);
        console.log(`SQLite-Datenbank ${opts.migrateFromSqlite} übernommen (${n} Aufgaben).`);
        migrated = true;
      } catch (e) {
        // Übernahme läuft in einer Transaktion – bei Fehlern bleibt die neue Datenbank leer
        console.error(`SQLite-Datenbank ${opts.migrateFromSqlite} konnte nicht übernommen werden:`, e instanceof Error ? e.message : e);
      }
    }
    if (!migrated && opts.importDir) await importLegacyXml(db, opts.importDir);
  }
  if (opts.admin?.username && opts.admin.password) {
    const n = await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users");
    if (!n?.n) {
      await db.run("INSERT INTO users (username, password_hash, is_admin, created_at) VALUES ($1, $2, 1, $3)",
        [opts.admin.username, hashPassword(opts.admin.password), new Date().toISOString()]);
    }
  }
  return db;
}

/** SQLite-Datenbank öffnen (Datei oder ":memory:") und einrichten. */
export async function openSqliteDb(file: string, opts: OpenOptions = {}): Promise<Db> {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  return initDb(openSqlite(file), opts);
}

/** PostgreSQL-Datenbank öffnen und einrichten. */
export async function openPostgresDb(url: string, opts: OpenOptions = {}): Promise<Db> {
  return initDb(openPostgres(url), opts);
}

// ---- Gemeinsame Instanz für den Server ------------------------------------------------------------------

const g = globalThis as unknown as { __stackDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__stackDb) {
    const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.STACK_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
    const xmlDir = path.resolve(/*turbopackIgnore: true*/ process.env.STACK_XML_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "xml"));
    const sqliteFile = path.join(dataDir, "stack-editor.db");
    const opts: OpenOptions = {
      importDir: xmlDir,
      admin: process.env.ADMIN_USER && process.env.ADMIN_PASSWORD
        ? { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }
        : undefined,
    };
    const url = process.env.DATABASE_URL?.trim();
    g.__stackDb = (url ? openPostgresDb(url, { ...opts, migrateFromSqlite: sqliteFile }) : openSqliteDb(sqliteFile, opts))
      .catch((e) => {
        g.__stackDb = undefined; // beim nächsten Aufruf erneut versuchen (z. B. Datenbank startet noch)
        throw e;
      });
  }
  return g.__stackDb;
}
