import type Database from "better-sqlite3";

import type { AlignmentEvent, AlignmentScore } from "@shared/domain.js";
import { getDb } from "../index.js";

interface AlignmentDbRow {
  id: number;
  agent_id: string;
  thread_id: string;
  score: AlignmentScore;
  reasoning: string;
  created_at: number;
}

function fromRow(r: AlignmentDbRow): AlignmentEvent {
  return {
    id: r.id,
    agentId: r.agent_id,
    threadId: r.thread_id,
    score: r.score,
    reasoning: r.reasoning,
    createdAt: r.created_at,
  };
}

export class AlignmentRepository {
  constructor(private db: Database.Database = getDb()) {}

  log(agentId: string, threadId: string, score: AlignmentScore, reasoning: string): AlignmentEvent {
    const now = Date.now();
    const res = this.db
      .prepare(
        "INSERT INTO alignment_events (agent_id, thread_id, score, reasoning, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(agentId, threadId, score, reasoning, now);

    return {
      id: Number(res.lastInsertRowid),
      agentId,
      threadId,
      score,
      reasoning,
      createdAt: now,
    };
  }

  latest(agentId: string, threadId?: string): AlignmentEvent | null {
    const row = threadId
      ? (this.db
          .prepare(
            "SELECT * FROM alignment_events WHERE agent_id=? AND thread_id=? ORDER BY id DESC LIMIT 1",
          )
          .get(agentId, threadId) as AlignmentDbRow | undefined)
      : (this.db
          .prepare("SELECT * FROM alignment_events WHERE agent_id=? ORDER BY id DESC LIMIT 1")
          .get(agentId) as AlignmentDbRow | undefined);
    return row ? fromRow(row) : null;
  }

  listForThread(threadId: string, limit = 50): AlignmentEvent[] {
    return (
      this.db
        .prepare("SELECT * FROM alignment_events WHERE thread_id=? ORDER BY id DESC LIMIT ?")
        .all(threadId, limit) as AlignmentDbRow[]
    ).map(fromRow);
  }
}
