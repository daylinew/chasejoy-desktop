import type Database from "better-sqlite3";

import { getDb } from "../index.js";

export interface ApprovalPolicy {
  id: number;
  agentId: string;
  tool: string;
  fingerprint: string;
  decision: "allow" | "deny";
  createdAt: number;
}

interface ApprovalDbRow {
  id: number;
  agent_id: string;
  tool: string;
  fingerprint: string;
  decision: "allow" | "deny";
  created_at: number;
}

function fromRow(r: ApprovalDbRow): ApprovalPolicy {
  return {
    id: r.id,
    agentId: r.agent_id,
    tool: r.tool,
    fingerprint: r.fingerprint,
    decision: r.decision,
    createdAt: r.created_at,
  };
}

export class ApprovalPolicyRepository {
  constructor(private db: Database.Database = getDb()) {}

  remember(agentId: string, tool: string, fingerprint: string, decision: "allow" | "deny"): void {
    this.db
      .prepare(
        `INSERT INTO approval_policies (agent_id, tool, fingerprint, decision, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, tool, fingerprint) DO UPDATE SET decision=excluded.decision, created_at=excluded.created_at`,
      )
      .run(agentId, tool, fingerprint, decision, Date.now());
  }

  lookup(agentId: string, tool: string, fingerprint: string): ApprovalPolicy | null {
    const row = this.db
      .prepare(
        "SELECT * FROM approval_policies WHERE agent_id=? AND tool=? AND fingerprint=?",
      )
      .get(agentId, tool, fingerprint) as ApprovalDbRow | undefined;
    return row ? fromRow(row) : null;
  }

  listByAgent(agentId: string): ApprovalPolicy[] {
    return (
      this.db
        .prepare("SELECT * FROM approval_policies WHERE agent_id=? ORDER BY created_at DESC")
        .all(agentId) as ApprovalDbRow[]
    ).map(fromRow);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM approval_policies WHERE id=?").run(id);
  }
}
