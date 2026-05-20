import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { MemoryKind, MemoryRow } from "@shared/domain.js";
import { MemoryRepository } from "../../db/repositories/memories.js";

const memoryKindSchema = z.enum([
  "fact",
  "preference",
  "decision",
  "artifact",
  "milestone_progress",
]) as z.ZodType<MemoryKind>;

/**
 * MemoryService owns the long-term memory store.
 * - Direct methods are used by middleware / extractor / IPC handlers.
 * - Each `*ToolFor(agentId)` returns a LangChain tool that captures the agent in closure.
 */
export class MemoryService {
  constructor(private readonly repo = new MemoryRepository()) {}

  /* ---------- direct methods ---------- */
  save(input: {
    agentId: string | null;
    kind: MemoryKind;
    content: string;
    importance?: number;
    pinned?: boolean;
    crossAgent?: boolean;
    sourceThreadId?: string | null;
    sourceMessageId?: string | null;
  }): MemoryRow {
    return this.repo.save(input);
  }

  search(input: {
    agentId: string;
    query?: string;
    kinds?: MemoryKind[];
    limit?: number;
  }): MemoryRow[] {
    const rows = this.repo.search({
      agentId: input.agentId,
      query: input.query,
      kinds: input.kinds,
      limit: input.limit ?? 20,
    });
    if (rows.length > 0) this.repo.touchAccess(rows.map((r) => r.id));
    return rows;
  }

  listRecent(input: { agentId: string; limit?: number }): MemoryRow[] {
    return this.repo.listRecent({ agentId: input.agentId, limit: input.limit ?? 20 });
  }

  pin(id: string, pinned: boolean): void {
    this.repo.pin(id, pinned);
  }

  forget(id: string): void {
    this.repo.delete(id);
  }

  /**
   * Pull the Top-K most relevant memories for prompt injection.
   * Combines pinned/important memories with FTS hits against the query.
   */
  topK(agentId: string, query: string, k = 8): MemoryRow[] {
    const pinned = this.repo.listRecent({ agentId, limit: k });
    if (!query) return pinned.slice(0, k);

    const hits = this.repo.search({ agentId, query, limit: k });
    const seen = new Set<string>();
    const out: MemoryRow[] = [];
    for (const m of pinned) {
      if (m.pinned && out.length < k) {
        seen.add(m.id);
        out.push(m);
      }
    }
    for (const m of hits) {
      if (!seen.has(m.id) && out.length < k) {
        seen.add(m.id);
        out.push(m);
      }
    }
    for (const m of pinned) {
      if (!seen.has(m.id) && out.length < k) {
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  }

  /* ---------- tool factories ---------- */

  saveMemoryToolFor(agentId: string, threadIdRef: () => string | null) {
    return tool(
      async ({ kind, content, importance, pinned, crossAgent }) => {
        const row = this.save({
          agentId: crossAgent ? null : agentId,
          kind,
          content,
          importance,
          pinned,
          crossAgent,
          sourceThreadId: threadIdRef(),
        });
        return `Saved memory ${row.id} (${kind}).`;
      },
      {
        name: "save_memory",
        description:
          "Persist a long-lived fact, preference, decision, artifact reference, or milestone update for this agent. Use sparingly; only for things worth remembering across conversations. Set crossAgent=true ONLY for general user-level facts that should help every agent (e.g. user's preferred language).",
        schema: z.object({
          kind: memoryKindSchema.describe("Category of memory."),
          content: z.string().min(2).describe("Concise statement, written in third person."),
          importance: z.number().min(0).max(1).default(0.5).optional(),
          pinned: z.boolean().default(false).optional(),
          crossAgent: z.boolean().default(false).optional(),
        }),
      },
    );
  }

  searchMemoryToolFor(agentId: string) {
    return tool(
      async ({ query, kinds, limit }) => {
        const rows = this.search({ agentId, query, kinds: kinds as MemoryKind[] | undefined, limit });
        return formatMemoriesAsText(rows);
      },
      {
        name: "search_memory",
        description:
          "Search this agent's long-term memory by keyword. Returns a compact text list. Use before doing fresh research on questions the user has already answered.",
        schema: z.object({
          query: z.string().describe("Keyword(s); empty string returns most recent."),
          kinds: z.array(memoryKindSchema).optional(),
          limit: z.number().int().min(1).max(50).default(10).optional(),
        }),
      },
    );
  }

  listRecentMemoriesToolFor(agentId: string) {
    return tool(
      async ({ limit }) => {
        const rows = this.listRecent({ agentId, limit });
        return formatMemoriesAsText(rows);
      },
      {
        name: "list_recent_memories",
        description: "List this agent's most-recently-touched and pinned memories.",
        schema: z.object({
          limit: z.number().int().min(1).max(50).default(10).optional(),
        }),
      },
    );
  }

  pinMemoryTool() {
    return tool(
      async ({ id, pinned }) => {
        this.pin(id, pinned);
        return `Pinned=${pinned} for memory ${id}.`;
      },
      {
        name: "pin_memory",
        description: "Pin or unpin a memory by id so it stays at the top of relevance.",
        schema: z.object({
          id: z.string(),
          pinned: z.boolean(),
        }),
      },
    );
  }

  forgetMemoryTool() {
    return tool(
      async ({ id }) => {
        this.forget(id);
        return `Forgot memory ${id}.`;
      },
      {
        name: "forget_memory",
        description: "Permanently delete a memory by id. Use only when the user asks to forget something.",
        schema: z.object({ id: z.string() }),
      },
    );
  }
}

export function formatMemoriesAsText(rows: MemoryRow[]): string {
  if (rows.length === 0) return "(no memories)";
  return rows
    .map(
      (m) =>
        `- [${m.kind}${m.pinned ? "+pinned" : ""}${m.crossAgent ? "+global" : ""}] ${m.content} (id=${m.id}, imp=${m.importance.toFixed(2)})`,
    )
    .join("\n");
}
