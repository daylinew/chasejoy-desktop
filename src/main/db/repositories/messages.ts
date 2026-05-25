import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

import type { MessageRole, MessageRow } from "@shared/domain.js";
import { getDb } from "../index.js";

interface MessageDbRow {
  id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  tool_calls: string | null;
  subagents: string | null;
  message_meta: string | null;
  created_at: number;
}

function fromRow(r: MessageDbRow): MessageRow {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    content: r.content,
    toolCalls: r.tool_calls,
    subagents: r.subagents,
    messageMeta: r.message_meta,
    createdAt: r.created_at,
  };
}

export class MessageRepository {
  constructor(private db: Database.Database = getDb()) {}

  append(
    threadId: string,
    role: MessageRole,
    content: string,
    toolCalls?: unknown,
    subagents?: unknown,
    messageMeta?: unknown,
  ): MessageRow {
    const id = nanoid(14);
    const now = Date.now();
    const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
    const subagentsJson = subagents ? JSON.stringify(subagents) : null;
    const messageMetaJson = messageMeta ? JSON.stringify(messageMeta) : null;
    this.db
      .prepare(
        "INSERT INTO messages (id, thread_id, role, content, tool_calls, subagents, message_meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        threadId,
        role,
        content,
        toolCallsJson,
        subagentsJson,
        messageMetaJson,
        now,
      );
    return {
      id,
      threadId,
      role,
      content,
      toolCalls: toolCallsJson,
      subagents: subagentsJson,
      messageMeta: messageMetaJson,
      createdAt: now,
    };
  }

  listByThread(threadId: string, limit = 500): MessageRow[] {
    return (
      this.db
        .prepare("SELECT * FROM messages WHERE thread_id=? ORDER BY created_at ASC LIMIT ?")
        .all(threadId, limit) as MessageDbRow[]
    ).map(fromRow);
  }

  countByThread(threadId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as c FROM messages WHERE thread_id=?")
      .get(threadId) as { c: number };
    return row.c;
  }

  latestAssistantContent(threadId: string): string | null {
    const row = this.db
      .prepare("SELECT content FROM messages WHERE thread_id=? AND role='assistant' ORDER BY created_at DESC LIMIT 1")
      .get(threadId) as { content: string } | undefined;
    return row?.content ?? null;
  }
}
