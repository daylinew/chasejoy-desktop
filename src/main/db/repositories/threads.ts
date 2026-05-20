import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

import type { ThreadRow } from "@shared/domain.js";
import { getDb } from "../index.js";

interface ThreadDbRow {
  id: string;
  agent_id: string;
  title: string;
  created_at: number;
  last_active_at: number;
}

function fromRow(r: ThreadDbRow): ThreadRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    title: r.title,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
  };
}

export class ThreadRepository {
  constructor(private db: Database.Database = getDb()) {}

  create(agentId: string, title = "New conversation"): ThreadRow {
    const id = nanoid(12);
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO threads (id, agent_id, title, created_at, last_active_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, agentId, title, now, now);
    return this.requireById(id);
  }

  rename(id: string, title: string): void {
    this.db.prepare("UPDATE threads SET title=? WHERE id=?").run(title, id);
  }

  touch(id: string): void {
    this.db.prepare("UPDATE threads SET last_active_at=? WHERE id=?").run(Date.now(), id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM threads WHERE id=?").run(id);
  }

  findById(id: string): ThreadRow | null {
    const row = this.db.prepare("SELECT * FROM threads WHERE id=?").get(id) as ThreadDbRow | undefined;
    return row ? fromRow(row) : null;
  }

  requireById(id: string): ThreadRow {
    const t = this.findById(id);
    if (!t) throw new Error(`Thread not found: ${id}`);
    return t;
  }

  listByAgent(agentId: string): ThreadRow[] {
    return (
      this.db
        .prepare("SELECT * FROM threads WHERE agent_id=? ORDER BY last_active_at DESC")
        .all(agentId) as ThreadDbRow[]
    ).map(fromRow);
  }
}
