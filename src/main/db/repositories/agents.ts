import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

import type {
  AgentRow,
  BuiltinToolKey,
  NewAgentInput,
  ToolKey,
} from "@shared/domain.js";
import { getDb } from "../index.js";

interface AgentDbRow {
  id: string;
  name: string;
  role: string | null;
  goal_prompt: string;
  provider_id: string;
  model: string;
  workspace_dir: string;
  enabled_tools: string;
  enabled_builtin_tools: string;
  allowed_extra_paths: string;
  created_at: number;
  updated_at: number;
  archived: number;
}

function fromRow(r: AgentDbRow): AgentRow {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    goalPrompt: r.goal_prompt,
    providerId: r.provider_id,
    model: r.model,
    workspaceDir: r.workspace_dir,
    enabledTools: JSON.parse(r.enabled_tools) as ToolKey[],
    enabledBuiltinTools: JSON.parse(r.enabled_builtin_tools) as BuiltinToolKey[],
    allowedExtraPaths: JSON.parse(r.allowed_extra_paths) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archived: r.archived === 1,
  };
}

export class AgentRepository {
  constructor(private db: Database.Database = getDb()) {}

  create(input: NewAgentInput & { workspaceDir: string }): AgentRow {
    const now = Date.now();
    const id = nanoid(12);

    this.db
      .prepare(
        `INSERT INTO agents (id, name, role, goal_prompt, provider_id, model, workspace_dir,
                             enabled_tools, enabled_builtin_tools, allowed_extra_paths,
                             created_at, updated_at, archived)
         VALUES (@id, @name, @role, @goal, @provider, @model, @ws, @tools, @btools, @paths, @now, @now, 0)`,
      )
      .run({
        id,
        name: input.name,
        role: input.role ?? null,
        goal: input.goalPrompt,
        provider: input.providerId,
        model: input.model,
        ws: input.workspaceDir,
        tools: JSON.stringify(input.enabledTools ?? []),
        btools: JSON.stringify(input.enabledBuiltinTools ?? []),
        paths: JSON.stringify(input.allowedExtraPaths ?? []),
        now,
      });

    return this.requireById(id);
  }

  update(
    id: string,
    patch: Partial<Omit<AgentRow, "id" | "createdAt">>,
  ): AgentRow {
    const cur = this.requireById(id);
    const merged: AgentRow = {
      ...cur,
      ...patch,
      id: cur.id,
      createdAt: cur.createdAt,
      updatedAt: Date.now(),
    };

    this.db
      .prepare(
        `UPDATE agents SET name=@name, role=@role, goal_prompt=@goal, provider_id=@provider, model=@model,
                            workspace_dir=@ws, enabled_tools=@tools, enabled_builtin_tools=@btools,
                            allowed_extra_paths=@paths, updated_at=@updated, archived=@archived
         WHERE id=@id`,
      )
      .run({
        id: merged.id,
        name: merged.name,
        role: merged.role,
        goal: merged.goalPrompt,
        provider: merged.providerId,
        model: merged.model,
        ws: merged.workspaceDir,
        tools: JSON.stringify(merged.enabledTools),
        btools: JSON.stringify(merged.enabledBuiltinTools),
        paths: JSON.stringify(merged.allowedExtraPaths),
        updated: merged.updatedAt,
        archived: merged.archived ? 1 : 0,
      });

    return merged;
  }

  archive(id: string): void {
    this.db.prepare("UPDATE agents SET archived=1, updated_at=? WHERE id=?").run(Date.now(), id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM agents WHERE id=?").run(id);
  }

  findById(id: string): AgentRow | null {
    const row = this.db.prepare("SELECT * FROM agents WHERE id=?").get(id) as AgentDbRow | undefined;
    return row ? fromRow(row) : null;
  }

  requireById(id: string): AgentRow {
    const found = this.findById(id);
    if (!found) throw new Error(`Agent not found: ${id}`);
    return found;
  }

  list(includeArchived = false): AgentRow[] {
    const sql = includeArchived
      ? "SELECT * FROM agents ORDER BY updated_at DESC"
      : "SELECT * FROM agents WHERE archived=0 ORDER BY updated_at DESC";
    return (this.db.prepare(sql).all() as AgentDbRow[]).map(fromRow);
  }
}
