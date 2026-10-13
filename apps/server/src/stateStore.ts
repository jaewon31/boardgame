import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LobbyCheckpoint } from './lobby.ts';

export interface StateStore { load(): LobbyCheckpoint | null; save(state: LobbyCheckpoint): void }

// Private beta: exactly one process owns this volume. SQLite retains its exclusive
// lock across commits, so a second writer fails at startup instead of splitting rooms.
export class SqliteStateStore implements StateStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      chmodSync(path, 0o600);
      this.db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA locking_mode=EXCLUSIVE;');
      this.db.exec('CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
      this.db.exec('BEGIN EXCLUSIVE; COMMIT;');
    } catch (error) { this.db.close(); throw error; }
  }
  load(): LobbyCheckpoint | null {
    const row = this.db.prepare('SELECT payload FROM checkpoint WHERE id=1').get();
    return row ? JSON.parse(String(row.payload)) : null;
  }
  save(state: LobbyCheckpoint) {
    this.db.prepare('INSERT INTO checkpoint(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(state));
  }
  close() { this.db.close(); }
}
