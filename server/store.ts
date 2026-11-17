import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, LogEntry, Side } from '../rules';

export interface SessionRecord {
  id: string;
  state: GameState;
  /** SHA-256 hashes of the seat tokens; null until the seat is issued. */
  seats: Record<Side, string | null>;
  /** The unclaimed invite, if any. */
  invite: { hash: string; side: Side } | null;
  createdAt: number;
  lastActive: number;
  /** How many log entries are already in the log table. */
  savedLog: number;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
/** Sessions saved by an older rules revision are discarded, not migrated. */
const STATE_VERSION = 3;

/** Each session is one JSON state blob plus an append-only log table. */
export class Store {
  private db: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, last_active INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS log (
        session_id TEXT NOT NULL, seq INTEGER NOT NULL, entry TEXT NOT NULL, PRIMARY KEY (session_id, seq));
    `);
  }

  /** Delete sessions idle for 30 days, and any from an older rules revision. Returns how many were removed. */
  cleanup(now = Date.now()): number {
    const cutoff = now - THIRTY_DAYS;
    const stale = `last_active < ? OR json_extract(data, '$.state.v') IS NOT ${STATE_VERSION}`;
    return this.db.transaction(() => {
      this.db.prepare(`DELETE FROM log WHERE session_id IN (SELECT id FROM sessions WHERE ${stale})`).run(cutoff);
      return this.db.prepare(`DELETE FROM sessions WHERE ${stale}`).run(cutoff).changes;
    })();
  }

  load(id: string): SessionRecord | null {
    const row = this.db.prepare('SELECT data, created_at, last_active FROM sessions WHERE id = ?').get(id) as
      { data: string; created_at: number; last_active: number } | undefined;
    if (!row) return null;
    const data = JSON.parse(row.data);
    if (data.state?.v !== STATE_VERSION) return null;
    const log = (this.db.prepare('SELECT entry FROM log WHERE session_id = ? ORDER BY seq').all(id) as { entry: string }[])
      .map((r) => JSON.parse(r.entry) as LogEntry);
    return {
      id, state: { ...data.state, log }, seats: data.seats, invite: data.invite,
      createdAt: row.created_at, lastActive: row.last_active, savedLog: log.length,
    };
  }

  save(rec: SessionRecord) {
    rec.lastActive = Date.now();
    const { log, ...state } = rec.state;
    const data = JSON.stringify({ state, seats: rec.seats, invite: rec.invite });
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO sessions (id, data, created_at, last_active) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, last_active = excluded.last_active`)
        .run(rec.id, data, rec.createdAt, rec.lastActive);
      const insert = this.db.prepare('INSERT OR IGNORE INTO log (session_id, seq, entry) VALUES (?, ?, ?)');
      for (const e of log.slice(rec.savedLog)) insert.run(rec.id, e.seq, JSON.stringify(e));
    })();
    rec.savedLog = log.length;
  }

  close() {
    this.db.close();
  }
}
