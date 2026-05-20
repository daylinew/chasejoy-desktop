import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

import { migrations } from "./migrations.js";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const userData = app.getPath("userData");
  const dbDir = path.join(userData, "data");
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, "chasejoy.db");
  _db = open(dbPath);
  return _db;
}

export function openInMemoryDb(): Database.Database {
  return open(":memory:");
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function open(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );`);

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );

  const insertApplied = db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)");

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      insertApplied.run(m.name, Date.now());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
    }
  }
}
