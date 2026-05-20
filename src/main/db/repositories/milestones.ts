import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

import type { MilestoneRow, MilestoneStatus } from "@shared/domain.js";
import { getDb } from "../index.js";

interface MilestoneDbRow {
  id: string;
  agent_id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  order_index: number;
  due_at: number | null;
  created_at: number;
  updated_at: number;
}

function fromRow(r: MilestoneDbRow): MilestoneRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    title: r.title,
    description: r.description,
    status: r.status,
    orderIndex: r.order_index,
    dueAt: r.due_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class MilestoneRepository {
  constructor(private db: Database.Database = getDb()) {}

  create(input: {
    agentId: string;
    title: string;
    description?: string;
    status?: MilestoneStatus;
    dueAt?: number;
  }): MilestoneRow {
    const id = nanoid(10);
    const now = Date.now();
    const nextOrder = this.nextOrderIndex(input.agentId);

    this.db
      .prepare(
        `INSERT INTO milestones (id, agent_id, title, description, status, order_index, due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.agentId,
        input.title,
        input.description ?? null,
        input.status ?? "todo",
        nextOrder,
        input.dueAt ?? null,
        now,
        now,
      );

    return this.requireById(id);
  }

  update(id: string, patch: Partial<Omit<MilestoneRow, "id" | "agentId" | "createdAt">>): MilestoneRow {
    const cur = this.requireById(id);
    const merged: MilestoneRow = {
      ...cur,
      ...patch,
      id: cur.id,
      agentId: cur.agentId,
      createdAt: cur.createdAt,
      updatedAt: Date.now(),
    };

    this.db
      .prepare(
        `UPDATE milestones SET title=@title, description=@description, status=@status,
                                order_index=@order, due_at=@due, updated_at=@updated
         WHERE id=@id`,
      )
      .run({
        id: merged.id,
        title: merged.title,
        description: merged.description,
        status: merged.status,
        order: merged.orderIndex,
        due: merged.dueAt,
        updated: merged.updatedAt,
      });

    return merged;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM milestones WHERE id=?").run(id);
  }

  findById(id: string): MilestoneRow | null {
    const row = this.db.prepare("SELECT * FROM milestones WHERE id=?").get(id) as
      | MilestoneDbRow
      | undefined;
    return row ? fromRow(row) : null;
  }

  requireById(id: string): MilestoneRow {
    const m = this.findById(id);
    if (!m) throw new Error(`Milestone not found: ${id}`);
    return m;
  }

  listByAgent(agentId: string): MilestoneRow[] {
    return (
      this.db
        .prepare("SELECT * FROM milestones WHERE agent_id=? ORDER BY order_index ASC, created_at ASC")
        .all(agentId) as MilestoneDbRow[]
    ).map(fromRow);
  }

  private nextOrderIndex(agentId: string): number {
    const r = this.db
      .prepare("SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM milestones WHERE agent_id=?")
      .get(agentId) as { n: number };
    return r.n;
  }
}
