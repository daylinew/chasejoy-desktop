import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

import type { MemoryKind, MemoryRow } from "@shared/domain.js";
import { getDb } from "../index.js";

interface MemoryDbRow {
  id: string;
  agent_id: string | null;
  kind: MemoryKind;
  content: string;
  source_thread_id: string | null;
  source_message_id: string | null;
  importance: number;
  pinned: number;
  cross_agent: number;
  embedding: Buffer | null;
  created_at: number;
  last_accessed_at: number;
}

function fromRow(r: MemoryDbRow): MemoryRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    kind: r.kind,
    content: r.content,
    sourceThreadId: r.source_thread_id,
    sourceMessageId: r.source_message_id,
    importance: r.importance,
    pinned: r.pinned === 1,
    crossAgent: r.cross_agent === 1,
    createdAt: r.created_at,
    lastAccessedAt: r.last_accessed_at,
  };
}

export interface SaveMemoryInput {
  agentId: string | null;
  kind: MemoryKind;
  content: string;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  importance?: number;
  pinned?: boolean;
  crossAgent?: boolean;
}

export interface SearchMemoryQuery {
  /** Restrict to this agent's memories (always also include cross-agent globals). */
  agentId: string | null;
  query?: string;
  /** Match these kinds only. */
  kinds?: MemoryKind[];
  limit?: number;
}

export class MemoryRepository {
  constructor(private db: Database.Database = getDb()) {}

  save(input: SaveMemoryInput): MemoryRow {
    const id = nanoid(12);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO memories (id, agent_id, kind, content, source_thread_id, source_message_id,
                               importance, pinned, cross_agent, created_at, last_accessed_at)
         VALUES (@id, @agent, @kind, @content, @thread, @msg, @imp, @pin, @cross, @now, @now)`,
      )
      .run({
        id,
        agent: input.agentId,
        kind: input.kind,
        content: input.content,
        thread: input.sourceThreadId ?? null,
        msg: input.sourceMessageId ?? null,
        imp: input.importance ?? 0.5,
        pin: input.pinned ? 1 : 0,
        cross: input.crossAgent ? 1 : 0,
        now,
      });
    return this.requireById(id);
  }

  pin(id: string, pinned: boolean): void {
    this.db.prepare("UPDATE memories SET pinned=? WHERE id=?").run(pinned ? 1 : 0, id);
  }

  promoteToGlobal(id: string): void {
    this.db.prepare("UPDATE memories SET cross_agent=1 WHERE id=?").run(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM memories WHERE id=?").run(id);
  }

  findById(id: string): MemoryRow | null {
    const row = this.db.prepare("SELECT * FROM memories WHERE id=?").get(id) as
      | MemoryDbRow
      | undefined;
    return row ? fromRow(row) : null;
  }

  requireById(id: string): MemoryRow {
    const m = this.findById(id);
    if (!m) throw new Error(`Memory not found: ${id}`);
    return m;
  }

  touchAccess(ids: string[]): void {
    if (ids.length === 0) return;
    const now = Date.now();
    const stmt = this.db.prepare("UPDATE memories SET last_accessed_at=? WHERE id=?");
    const tx = this.db.transaction((rows: string[]) => {
      for (const id of rows) stmt.run(now, id);
    });
    tx(ids);
  }

  /** List most recent / pinned without keyword filter. */
  listRecent(query: SearchMemoryQuery): MemoryRow[] {
    const limit = query.limit ?? 20;
    const kindFilter = (query.kinds && query.kinds.length > 0)
      ? ` AND kind IN (${query.kinds.map(() => "?").join(",")})`
      : "";

    const params: unknown[] = [query.agentId];
    if (query.kinds) params.push(...query.kinds);
    params.push(limit);

    const rows = this.db
      .prepare(
        `SELECT * FROM memories
         WHERE (agent_id = ? OR cross_agent = 1)${kindFilter}
         ORDER BY pinned DESC, importance DESC, last_accessed_at DESC, created_at DESC
         LIMIT ?`,
      )
      .all(...params) as MemoryDbRow[];

    return rows.map(fromRow);
  }

  /** FTS5 keyword search; falls back to listRecent if query is empty. */
  search(query: SearchMemoryQuery): MemoryRow[] {
    if (!query.query || query.query.trim().length === 0) {
      return this.listRecent(query);
    }

    const limit = query.limit ?? 20;
    const fts = sanitizeFtsQuery(query.query);

    const kindFilter = (query.kinds && query.kinds.length > 0)
      ? ` AND m.kind IN (${query.kinds.map(() => "?").join(",")})`
      : "";

    const params: unknown[] = [fts, query.agentId];
    if (query.kinds) params.push(...query.kinds);
    params.push(limit);

    const rows = this.db
      .prepare(
        `SELECT m.*
         FROM memories_fts f
         JOIN memories m ON m.id = f.memory_id
         WHERE memories_fts MATCH ?
           AND (m.agent_id = ? OR m.cross_agent = 1)${kindFilter}
         ORDER BY m.pinned DESC, bm25(memories_fts), m.importance DESC, m.last_accessed_at DESC
         LIMIT ?`,
      )
      .all(...params) as MemoryDbRow[];

    return rows.map(fromRow);
  }
}

/** Make an arbitrary user string safe for an FTS5 MATCH expression. */
function sanitizeFtsQuery(raw: string): string {
  const tokens = raw
    .replace(/["()*]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, "\"\"")}"*`);
  return tokens.length === 0 ? "\"\"" : tokens.join(" OR ");
}
