// Gemeinsame, asynchrone Datenbank-Schnittstelle für PostgreSQL (Betrieb) und SQLite (lokale Entwicklung).
// SQL wird in PostgreSQL-Schreibweise geschrieben ($1, $2 …, RETURNING); für SQLite werden die
// Platzhalter umgesetzt. Beide Systeme verstehen dieselben Abfragen dieser Anwendung.

import Database from "better-sqlite3";
import pg from "pg";

export type Dialect = "postgres" | "sqlite";

export interface Db {
  dialect: Dialect;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  /** Mehrere Anweisungen ohne Parameter (Schema). */
  exec(sql: string): Promise<void>;
  /** Transaktion; verschachtelte Aufrufe nutzen Savepoints. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Verletzung einer Eindeutigkeitsregel (doppelter Name o. Ä.)? */
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "23505" || err?.code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint/i.test(err?.message ?? "");
}

// ---- PostgreSQL ----------------------------------------------------------------------------------

type PgRunner = { query: (sql: string, params?: unknown[]) => Promise<pg.QueryResult> };

class PgDb implements Db {
  dialect: Dialect = "postgres";
  private depth = 0;
  constructor(private runner: PgRunner, private pool: pg.Pool | null, depth = 0) { this.depth = depth; }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.runner.query(sql, params)).rows as T[];
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }
  async run(sql: string, params: unknown[] = []) {
    return { changes: (await this.runner.query(sql, params)).rowCount ?? 0 };
  }
  async exec(sql: string) {
    await this.runner.query(sql);
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const r = await fn(new PgDb(client, null, 1));
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
    const sp = `sp${this.depth}`;
    await this.runner.query(`SAVEPOINT ${sp}`);
    try {
      const r = await fn(new PgDb(this.runner, null, this.depth + 1));
      await this.runner.query(`RELEASE SAVEPOINT ${sp}`);
      return r;
    } catch (e) {
      await this.runner.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
      throw e;
    }
  }
  async close() {
    await this.pool?.end();
  }
}

export function openPostgres(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // Verbindungsabbrüche einzelner, ruhender Verbindungen nicht als Absturz behandeln
  pool.on("error", (e) => console.error("PostgreSQL:", e.message));
  return new PgDb(pool, pool);
}

// ---- SQLite ----------------------------------------------------------------------------------------

/** $1, $2 … → ? mit passend sortierten Parametern. */
function toSqlite(sql: string, params: unknown[]): [string, unknown[]] {
  const ordered: unknown[] = [];
  const text = sql.replace(/\$(\d+)/g, (_, n: string) => { ordered.push(params[Number(n) - 1]); return "?"; });
  return [text, ordered.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p))];
}

class SqliteDb implements Db {
  dialect: Dialect = "sqlite";
  /** better-sqlite3 arbeitet synchron auf einer Verbindung – Transaktionen werden deshalb nacheinander ausgeführt. */
  private lock: Promise<unknown> = Promise.resolve();
  constructor(private db: Database.Database, private inTx = 0) {}

  private async ready() {
    if (!this.inTx) await this.lock;
  }
  private stmt(sql: string, params: unknown[]) {
    const [text, args] = toSqlite(sql, params);
    return { st: this.db.prepare(text), args };
  }
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.ready();
    const { st, args } = this.stmt(sql, params);
    if (st.reader) return st.all(...args) as T[];
    st.run(...args);
    return [];
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }
  async run(sql: string, params: unknown[] = []) {
    await this.ready();
    const { st, args } = this.stmt(sql, params);
    if (st.reader) return { changes: st.all(...args).length };
    return { changes: st.run(...args).changes };
  }
  async exec(sql: string) {
    await this.ready();
    this.db.exec(sql);
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.inTx) {
      const sp = `sp${this.inTx}`;
      this.db.exec(`SAVEPOINT ${sp}`);
      try {
        const r = await fn(new SqliteDb(this.db, this.inTx + 1));
        this.db.exec(`RELEASE ${sp}`);
        return r;
      } catch (e) {
        this.db.exec(`ROLLBACK TO ${sp}`);
        this.db.exec(`RELEASE ${sp}`);
        throw e;
      }
    }
    const run = async () => {
      this.db.exec("BEGIN");
      try {
        const r = await fn(new SqliteDb(this.db, 1));
        this.db.exec("COMMIT");
        return r;
      } catch (e) {
        if (this.db.inTransaction) this.db.exec("ROLLBACK");
        throw e;
      }
    };
    const p = this.lock.then(run, run);
    this.lock = p.catch(() => {});
    return p;
  }
  async close() {
    this.db.close();
  }
  /** Direkter Zugriff für die SQLite-Pragmas beim Öffnen. */
  raw() { return this.db; }
}

export function openSqlite(file: string, opts: { readonly?: boolean } = {}): Db & { raw(): Database.Database } {
  const db = new Database(file, opts.readonly ? { readonly: true, fileMustExist: true } : {});
  if (!opts.readonly) {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  db.pragma("busy_timeout = 5000");
  return new SqliteDb(db);
}
