// Datenzugriff: Benutzer, Sitzungen, Kategorien, XML-Dateien. Alle Funktionen erhalten die DB explizit (testbar)
// und laufen unverändert mit PostgreSQL und SQLite (siehe sql.ts).

import { type Db, isUniqueViolation } from "./sql.ts";
import { numberedName } from "../filename.ts";
import { claimOrphans } from "./db.ts";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "./password.ts";
import { describeXml } from "./xmlmeta.ts";
import { type Person, personLabel, personName } from "../people.ts";

export class StoreError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const now = () => new Date().toISOString();
/** Zeitstempel, der sicher nach `prev` liegt – auch bei zwei Speichervorgängen in derselben Millisekunde. */
const after = (prev: string) => new Date(Math.max(Date.now(), new Date(prev).getTime() + 1)).toISOString();
const SESSION_DAYS = 30;
const MAX_VERSIONS = 20;
const count = async (db: Db, sql: string, params: unknown[] = []) =>
  (await db.get<{ n: number }>(`SELECT CAST(COUNT(*) AS INTEGER) AS n ${sql}`, params))?.n ?? 0;

// ---- Benutzer ---------------------------------------------------------------------------

export interface User { id: number; username: string; firstName: string; lastName: string; isAdmin: boolean; createdAt: string }

interface UserRow { id: number; username: string; first_name: string; last_name: string; is_admin: number; created_at: string; password_hash: string }
const toUser = (r: UserRow): User => ({
  id: r.id, username: r.username, firstName: r.first_name, lastName: r.last_name, isAdmin: !!r.is_admin, createdAt: r.created_at,
});

const MAX_NAME = 80;
function checkNames(firstName: string, lastName: string): [string, string] {
  firstName = firstName.trim();
  lastName = lastName.trim();
  if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) {
    throw new StoreError(`Vor- und Nachname dürfen höchstens ${MAX_NAME} Zeichen lang sein`, 400);
  }
  return [firstName, lastName];
}

export function countUsers(db: Db): Promise<number> {
  return count(db, "FROM users");
}

export async function listUsers(db: Db): Promise<(User & { fileCount: number; categoryCount: number })[]> {
  const rows = await db.query<UserRow & { file_count: number; category_count: number }>(
    `SELECT u.*,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM files f WHERE f.owner_id = u.id) AS file_count,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM categories c WHERE c.owner_id = u.id) AS category_count
     FROM users u ORDER BY lower(u.username)`,
  );
  return rows.map((r) => ({ ...toUser(r), fileCount: r.file_count, categoryCount: r.category_count }));
}

/** Alle anderen Benutzer als Personenverzeichnis (z. B. zum Teilen), sortiert nach Anzeigename. */
export async function listPeople(db: Db, exceptUserId: number): Promise<Person[]> {
  const rows = await db.query<UserRow>("SELECT * FROM users WHERE id <> $1", [exceptUserId]);
  return rows
    .map((r): Person => ({ id: r.id, username: r.username, firstName: r.first_name, lastName: r.last_name }))
    .sort((a, b) => personLabel(a).localeCompare(personLabel(b), "de"));
}

/** Setzt Vor- und/oder Nachname; ein weggelassener (undefined) Wert bleibt unverändert. */
export async function setUserNames(db: Db, userId: number, firstName: string | undefined, lastName: string | undefined) {
  const [first, last] = checkNames(firstName ?? "", lastName ?? "");
  const sets: string[] = [];
  const params: unknown[] = [userId];
  if (firstName !== undefined) { params.push(first); sets.push(`first_name = $${params.length}`); }
  if (lastName !== undefined) { params.push(last); sets.push(`last_name = $${params.length}`); }
  if (!sets.length) return;
  const row = await db.get<{ id: number }>(`UPDATE users SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
  if (!row) throw new StoreError("Benutzer nicht gefunden", 404);
}

function checkCredentials(username: string, password: string) {
  if (!/^[\w.@-]{2,50}$/.test(username)) {
    throw new StoreError("Benutzername: 2–50 Zeichen, erlaubt sind Buchstaben, Ziffern und . _ @ -");
  }
  if (password.length < 8) throw new StoreError("Das Passwort muss mindestens 8 Zeichen lang sein");
}

export async function createUser(db: Db, username: string, password: string, isAdmin: boolean, names: { firstName?: string; lastName?: string } = {}): Promise<User> {
  username = username.trim();
  checkCredentials(username, password);
  const [firstName, lastName] = checkNames(names.firstName ?? "", names.lastName ?? "");
  try {
    const row = await db.get<UserRow>(
      "INSERT INTO users (username, first_name, last_name, password_hash, is_admin, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [username, firstName, lastName, hashPassword(password), isAdmin ? 1 : 0, now()],
    );
    // Der erste Administrator übernimmt alle herrenlosen Daten (Import, Altbestand)
    if (isAdmin) await claimOrphans(db, row!.id);
    return toUser(row!);
  } catch (e) {
    if (isUniqueViolation(e)) throw new StoreError(`Benutzer „${username}“ existiert bereits`, 409);
    throw e;
  }
}

export async function setPassword(db: Db, userId: number, password: string) {
  if (password.length < 8) throw new StoreError("Das Passwort muss mindestens 8 Zeichen lang sein");
  await db.run("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(password), userId]);
}

export async function checkPassword(db: Db, userId: number, password: string): Promise<boolean> {
  const row = await db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  return !!row && verifyPassword(password, row.password_hash);
}

export async function deleteUser(db: Db, userId: number) {
  await db.tx(async (t) => {
    const target = await t.get<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);
    if (!target) throw new StoreError("Benutzer nicht gefunden", 404);
    if (target.is_admin && (await count(t, "FROM users WHERE is_admin = 1")) <= 1) {
      throw new StoreError("Der letzte Administrator kann nicht gelöscht werden");
    }
    await t.run("DELETE FROM users WHERE id = $1", [userId]);
  });
}

// ---- Sitzungen ----------------------------------------------------------------------------

export async function login(db: Db, username: string, password: string): Promise<{ user: User; token: string; expires: Date } | null> {
  const row = await db.get<UserRow>("SELECT * FROM users WHERE lower(username) = lower($1)", [username.trim()]);
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  await db.run("DELETE FROM sessions WHERE expires_at < $1", [now()]);
  const { token, hash } = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [hash, row.id, expires.toISOString()]);
  return { user: toUser(row), token, expires };
}

export async function userForToken(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const row = await db.get<UserRow>(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > $2",
    [hashToken(token), now()],
  );
  return row ? toUser(row) : null;
}

export async function logout(db: Db, token: string | undefined) {
  if (token) await db.run("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

// ---- Kategorien ---------------------------------------------------------------------------

export interface Category { id: number; name: string; fileCount: number }

function checkCategoryName(name: string) {
  name = name.trim();
  if (!name || name.length > 80) throw new StoreError("Kategoriename: 1–80 Zeichen");
  return name;
}

/** Die eigenen Kategorien des Benutzers. */
export function listCategories(db: Db, userId: number): Promise<Category[]> {
  return db.query<Category>(
    `SELECT c.id, c.name, CAST(COUNT(f.id) AS INTEGER) AS "fileCount" FROM categories c
     LEFT JOIN files f ON f.category_id = c.id AND f.owner_id = c.owner_id
     WHERE c.owner_id = $1 GROUP BY c.id, c.name ORDER BY lower(c.name)`,
    [userId],
  );
}

export async function createCategory(db: Db, name: string, userId: number): Promise<Category> {
  name = checkCategoryName(name);
  try {
    const r = await db.get<{ id: number }>("INSERT INTO categories (name, created_by, owner_id, created_at) VALUES ($1, $2, $2, $3) RETURNING id", [name, userId, now()]);
    return { id: r!.id, name, fileCount: 0 };
  } catch (e) {
    if (isUniqueViolation(e)) throw new StoreError(`Kategorie „${name}“ existiert bereits`, 409);
    throw e;
  }
}

export async function renameCategory(db: Db, userId: number, id: number, name: string) {
  name = checkCategoryName(name);
  let changes: number;
  try {
    changes = (await db.run("UPDATE categories SET name = $1 WHERE id = $2 AND owner_id = $3", [name, id, userId])).changes;
  } catch (e) {
    if (isUniqueViolation(e)) throw new StoreError(`Kategorie „${name}“ existiert bereits`, 409);
    throw e;
  }
  if (!changes) throw new StoreError("Kategorie nicht gefunden", 404);
}

/** Löscht die Kategorie; enthaltene Dateien bleiben erhalten und sind danach ohne Kategorie. */
export async function deleteCategory(db: Db, userId: number, id: number) {
  const r = await db.run("DELETE FROM categories WHERE id = $1 AND owner_id = $2", [id, userId]);
  if (!r.changes) throw new StoreError("Kategorie nicht gefunden", 404);
}

// ---- Dateien ----------------------------------------------------------------------------------

/** Rolle des Benutzers an einer Datei: Besitzer oder die Freigabestufe. */
export type FileRole = "owner" | "edit" | "read";

export interface FileInfo {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  questions: string[];
  size: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  ownerId: number;
  ownerName: string;
  role: FileRole;
}
export interface FileFull extends FileInfo { content: string }

// $1 ist in allen Datei-Abfragen der aktuelle Benutzer. Die Kategorie gehört dem Besitzer und wird anderen nicht gezeigt.
const FILE_COLS = `f.id, f.name,
  CASE WHEN f.owner_id = $1 THEN f.category_id END AS category_id, CASE WHEN f.owner_id = $1 THEN c.name END AS category_name,
  f.question_names, CAST(LENGTH(f.content) AS INTEGER) AS size, f.created_at, f.updated_at,
  u.username AS updated_by_username, u.first_name AS updated_by_first_name, u.last_name AS updated_by_last_name,
  f.owner_id, o.username AS owner_username, o.first_name AS owner_first_name, o.last_name AS owner_last_name,
  CASE WHEN f.owner_id = $1 THEN 'owner' ELSE s.role END AS role`;
const FILE_FROM = `FROM files f JOIN users o ON o.id = f.owner_id
  LEFT JOIN categories c ON c.id = f.category_id
  LEFT JOIN users u ON u.id = f.updated_by
  LEFT JOIN file_shares s ON s.file_id = f.id AND s.user_id = $1`;
const FILE_VISIBLE = "(f.owner_id = $1 OR s.user_id IS NOT NULL)";

interface FileRow {
  id: number; name: string; category_id: number | null; category_name: string | null; question_names: string;
  size: number; created_at: string; updated_at: string;
  updated_by_username: string | null; updated_by_first_name: string | null; updated_by_last_name: string | null;
  owner_id: number; owner_username: string; owner_first_name: string; owner_last_name: string;
  role: FileRole; content?: string;
}
const toFile = (r: FileRow): FileInfo => ({
  id: r.id, name: r.name, categoryId: r.category_id, categoryName: r.category_name,
  questions: JSON.parse(r.question_names) as string[], size: r.size,
  createdAt: r.created_at, updatedAt: r.updated_at,
  updatedBy: r.updated_by_username == null ? null
    : personName({ username: r.updated_by_username, firstName: r.updated_by_first_name ?? "", lastName: r.updated_by_last_name ?? "" }),
  ownerId: r.owner_id,
  ownerName: personName({ username: r.owner_username, firstName: r.owner_first_name, lastName: r.owner_last_name }),
  role: r.role,
});

export function normalizeFileName(name: string): string {
  let n = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim();
  if (!/\.xml$/i.test(n)) n += ".xml";
  if (n.length < 5 || n.length > 200 || n.startsWith(".")) throw new StoreError("Ungültiger Dateiname");
  return n;
}

/**
 * Dateien, neueste zuerst. `scope`: eigene und geteilte (`all`, Standard), nur eigene oder nur mit mir geteilte.
 * `category`: Kategorie-ID, `null` = ohne Kategorie, `undefined` = alle; ein Kategoriefilter betrifft nur eigene Dateien.
 */
export async function listFiles(
  db: Db,
  userId: number,
  opts: { category?: number | null; limit?: number; search?: string; scope?: "all" | "own" | "shared" } = {},
): Promise<FileInfo[]> {
  const args: unknown[] = [userId];
  const scope = opts.scope ?? "all";
  const categoryFilter = opts.category !== undefined;
  const where: string[] = [
    categoryFilter || scope === "own" ? "f.owner_id = $1"
      : scope === "shared" ? "(s.user_id IS NOT NULL AND f.owner_id <> $1)"
      : FILE_VISIBLE,
  ];
  if (opts.category === null) where.push("f.category_id IS NULL");
  else if (opts.category !== undefined) { args.push(opts.category); where.push(`f.category_id = $${args.length}`); }
  if (opts.search) {
    const like = `%${opts.search.toLowerCase().replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    args.push(like);
    const n = args.length;
    where.push(`(lower(f.name) LIKE $${n} ESCAPE '\\' OR lower(f.question_names) LIKE $${n} ESCAPE '\\')`);
  }
  const sql = `SELECT ${FILE_COLS} ${FILE_FROM} WHERE ${where.join(" AND ")}
    ORDER BY f.updated_at DESC, f.id DESC ${opts.limit ? "LIMIT " + Math.max(1, Math.floor(opts.limit)) : ""}`;
  return (await db.query<FileRow>(sql, args)).map(toFile);
}

export async function getFile(db: Db, userId: number, id: number): Promise<FileFull> {
  const r = await db.get<FileRow>(`SELECT ${FILE_COLS}, f.content ${FILE_FROM} WHERE f.id = $2 AND ${FILE_VISIBLE}`, [userId, id]);
  if (!r) throw new StoreError("Datei nicht gefunden", 404);
  return { ...toFile(r), content: r.content! };
}

/** Rolle des Benutzers an der Datei; `null`, wenn die Datei fehlt oder ihm nicht zugänglich ist. */
async function fileRole(db: Db, userId: number, fileId: number): Promise<FileRole | null> {
  const r = await db.get<{ role: FileRole | null }>(
    `SELECT CASE WHEN f.owner_id = $1 THEN 'owner' ELSE s.role END AS role FROM files f
     LEFT JOIN file_shares s ON s.file_id = f.id AND s.user_id = $1 WHERE f.id = $2`,
    [userId, fileId],
  );
  return r?.role ?? null;
}

/** Die Kategorie muss existieren und dem Besitzer gehören. */
async function checkCategory(db: Db, ownerId: number, categoryId: number | null | undefined) {
  if (categoryId == null) return;
  if (!(await db.get("SELECT 1 AS ok FROM categories WHERE id = $1 AND owner_id = $2", [categoryId, ownerId]))) {
    throw new StoreError("Kategorie nicht gefunden", 404);
  }
}

function questionsOf(content: string): string[] {
  const meta = describeXml(content);
  if (!meta.ok) throw new StoreError(meta.error);
  return meta.questions;
}

/**
 * Legt eine Datei an. Dateinamen sind je Besitzer eindeutig. Existiert der Name schon, gibt es 409 – außer bei
 * `overwrite`, dann wird die vorhandene eigene Datei aktualisiert (alte Fassung landet in file_versions),
 * und bei `autoRename`, dann wird der nächste freie Name `name-2.xml`, `name-3.xml` … verwendet.
 * `overwrite` hat Vorrang vor `autoRename`.
 */
export async function createFile(
  db: Db,
  input: { name: string; content: string; categoryId?: number | null; overwrite?: boolean; autoRename?: boolean },
  userId: number,
): Promise<FileInfo> {
  const baseName = normalizeFileName(input.name);
  const autoRename = !!input.autoRename && !input.overwrite;
  const questions = questionsOf(input.content);
  await checkCategory(db, userId, input.categoryId);
  // Bei autoRename wird der ganze Versuch wiederholt, wenn ein gleichzeitiges Anlegen den Namen zuvor belegt hat
  // (außerhalb der Transaktion, denn PostgreSQL bricht sie nach dem Fehler ab).
  for (let attempt = 1; ; attempt++) {
    let name = baseName;
    try {
      return await db.tx(async (t) => {
        const taken = (n: string) => t.get<{ id: number }>("SELECT id FROM files WHERE owner_id = $1 AND lower(name) = lower($2)", [userId, n]);
        let existing = await taken(name);
        for (let n = 2; existing && autoRename; n++) {
          name = numberedName(baseName, n);
          existing = await taken(name);
        }
        if (existing) {
          if (!input.overwrite) throw new StoreError(`${name} existiert bereits`, 409, { exists: true, id: existing.id });
          return updateFile(t, userId, existing.id, { content: input.content, categoryId: input.categoryId });
        }
        const ts = now();
        const r = await t.get<{ id: number }>(
          `INSERT INTO files (name, content, category_id, question_names, created_by, updated_by, owner_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5, $5, $6, $6) RETURNING id`,
          [name, input.content, input.categoryId ?? null, JSON.stringify(questions), userId, ts],
        );
        return getFile(t, userId, r!.id);
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      if (autoRename && attempt < 5) continue;
      // gleichzeitig angelegt: wie „existiert bereits“ behandeln
      throw new StoreError(`${name} existiert bereits`, 409, { exists: true });
    }
  }
}

/**
 * Ändert Inhalt, Name und/oder Kategorie. `baseUpdatedAt` erkennt parallele Änderungen
 * anderer Benutzer (409, sofern nicht `force`). Besitzer ändern alles, Bearbeiter nur den Inhalt, Leser nichts.
 */
export async function updateFile(
  db: Db,
  userId: number,
  id: number,
  input: { content?: string; name?: string; categoryId?: number | null; baseUpdatedAt?: string; force?: boolean },
): Promise<FileInfo> {
  return db.tx(async (t) => {
    // FOR UPDATE sperrt die Zeile in PostgreSQL gegen gleichzeitiges Speichern (SQLite arbeitet ohnehin seriell)
    const cur = await t.get<{ id: number; name: string; content: string; updated_at: string; updated_by: number | null; owner_id: number }>(
      `SELECT * FROM files WHERE id = $1${t.dialect === "postgres" ? " FOR UPDATE" : ""}`, [id],
    );
    const role = cur ? await fileRole(t, userId, id) : null;
    if (!cur || !role) throw new StoreError("Datei nicht gefunden", 404);
    if (role === "read") throw new StoreError("Nur Lesezugriff", 403);
    if (role === "edit" && (input.name !== undefined || input.categoryId !== undefined)) {
      throw new StoreError("Name und Kategorie darf nur der Besitzer ändern", 403);
    }
    if (input.content !== undefined && input.baseUpdatedAt && input.baseUpdatedAt !== cur.updated_at && !input.force) {
      const who = cur.updated_by == null ? null
        : await t.get<{ username: string; first_name: string; last_name: string }>("SELECT username, first_name, last_name FROM users WHERE id = $1", [cur.updated_by]);
      const by = who ? personName({ username: who.username, firstName: who.first_name, lastName: who.last_name }) : null;
      throw new StoreError(
        `Die Datei wurde inzwischen${by ? ` von ${by}` : ""} geändert (${new Date(cur.updated_at).toLocaleString("de-DE")})`,
        409, { conflict: true },
      );
    }
    const sets: string[] = [];
    const args: unknown[] = [];
    const set = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
    if (input.name !== undefined) {
      const name = normalizeFileName(input.name);
      const clash = await t.get("SELECT id FROM files WHERE owner_id = $1 AND lower(name) = lower($2) AND id <> $3", [cur.owner_id, name, id]);
      if (clash) throw new StoreError(`${name} existiert bereits`, 409, { exists: true });
      set("name", name);
    }
    if (input.categoryId !== undefined) {
      await checkCategory(t, cur.owner_id, input.categoryId);
      set("category_id", input.categoryId);
    }
    if (input.content !== undefined && input.content !== cur.content) {
      const questions = questionsOf(input.content);
      await t.run("INSERT INTO file_versions (file_id, content, saved_by, saved_at) VALUES ($1, $2, $3, $4)",
        [id, cur.content, cur.updated_by, cur.updated_at]);
      await t.run(
        `DELETE FROM file_versions WHERE file_id = $1 AND id NOT IN
         (SELECT id FROM file_versions WHERE file_id = $2 ORDER BY id DESC LIMIT ${MAX_VERSIONS})`,
        [id, id],
      );
      set("content", input.content);
      set("question_names", JSON.stringify(questions));
    }
    if (sets.length) {
      // Kategorie verschieben zählt nicht als Bearbeitung des Inhalts
      if (input.content !== undefined || input.name !== undefined) {
        set("updated_at", after(cur.updated_at));
        set("updated_by", userId);
      }
      args.push(id);
      await t.run(`UPDATE files SET ${sets.join(", ")} WHERE id = $${args.length}`, args);
    }
    return getFile(t, userId, id);
  });
}

export async function deleteFile(db: Db, userId: number, id: number) {
  const role = await fileRole(db, userId, id);
  if (!role) throw new StoreError("Datei nicht gefunden", 404);
  if (role !== "owner") throw new StoreError("Nur der Besitzer kann die Datei löschen", 403);
  await db.run("DELETE FROM files WHERE id = $1 AND owner_id = $2", [id, userId]);
}

// ---- Freigaben ------------------------------------------------------------------------------

export type ShareRole = "read" | "edit";
export interface Share extends Person { role: ShareRole }

/** Nur der Besitzer verwaltet Freigaben; wer die Datei nicht sehen darf, erfährt nicht von ihr (404). */
async function requireOwner(db: Db, userId: number, fileId: number) {
  const role = await fileRole(db, userId, fileId);
  if (!role) throw new StoreError("Datei nicht gefunden", 404);
  if (role !== "owner") throw new StoreError("Nur der Besitzer kann Freigaben verwalten", 403);
}

export async function listShares(db: Db, ownerId: number, fileId: number): Promise<Share[]> {
  await requireOwner(db, ownerId, fileId);
  const rows = await db.query<UserRow & { role: ShareRole }>(
    "SELECT u.*, s.role FROM file_shares s JOIN users u ON u.id = s.user_id WHERE s.file_id = $1", [fileId]);
  return rows
    .map((r): Share => ({ id: r.id, username: r.username, firstName: r.first_name, lastName: r.last_name, role: r.role }))
    .sort((a, b) => personLabel(a).localeCompare(personLabel(b), "de"));
}

/** Gibt die Datei für einen Benutzer frei oder ändert dessen Stufe. */
export async function setShare(db: Db, ownerId: number, fileId: number, targetUserId: number, role: ShareRole): Promise<void> {
  await requireOwner(db, ownerId, fileId);
  if (role !== "read" && role !== "edit") throw new StoreError("Ungültige Freigabestufe", 400);
  if (targetUserId === ownerId) throw new StoreError("Eine Datei kann nicht mit dem Besitzer geteilt werden", 400);
  if (!(await db.get("SELECT id FROM users WHERE id = $1", [targetUserId]))) throw new StoreError("Benutzer nicht gefunden", 404);
  await db.run(
    `INSERT INTO file_shares (file_id, user_id, role, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (file_id, user_id) DO UPDATE SET role = excluded.role`,
    [fileId, targetUserId, role, now()],
  );
}

export async function removeShare(db: Db, ownerId: number, fileId: number, targetUserId: number): Promise<void> {
  await requireOwner(db, ownerId, fileId);
  const r = await db.run("DELETE FROM file_shares WHERE file_id = $1 AND user_id = $2", [fileId, targetUserId]);
  if (!r.changes) throw new StoreError("Freigabe nicht gefunden", 404);
}

// ---- Dashboard ------------------------------------------------------------------------------

export interface DashboardData {
  recent: FileInfo[];
  categories: (Category & { files: FileInfo[] })[];
  uncategorized: { fileCount: number; files: FileInfo[] };
  totalFiles: number;
  shared: FileInfo[];
}

/** Zuletzt geändert: eigene und geteilte Dateien; Kategorien und Zähler betreffen nur die eigenen. */
export async function dashboard(db: Db, userId: number, recentLimit = 10, perCategory = 5): Promise<DashboardData> {
  const cats = await listCategories(db, userId);
  return {
    recent: await listFiles(db, userId, { limit: recentLimit }),
    categories: await Promise.all(cats.map(async (c) => ({ ...c, files: await listFiles(db, userId, { category: c.id, limit: perCategory }) }))),
    uncategorized: {
      fileCount: await count(db, "FROM files WHERE category_id IS NULL AND owner_id = $1", [userId]),
      files: await listFiles(db, userId, { category: null, limit: perCategory }),
    },
    totalFiles: await count(db, "FROM files WHERE owner_id = $1", [userId]),
    shared: await listFiles(db, userId, { scope: "shared" }),
  };
}
