import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { AgentRow, MemoryKind, MessageRow } from "@shared/domain.js";
import { MemoryService } from "./memory-service.js";
import { MessageRepository } from "../../db/repositories/messages.js";

interface ExtractedMemory {
  kind: MemoryKind;
  content: string;
  importance?: number;
  crossAgent?: boolean;
}

const SYSTEM = `You distill durable facts from a conversation into a small set of memory entries.
Return ONLY a JSON array (max 8 items). Each item is:
{
  "kind": "fact" | "preference" | "decision" | "artifact" | "milestone_progress",
  "content": "<one short sentence, third person>",
  "importance": <0.1 to 0.95>,
  "crossAgent": false
}
Set crossAgent=true ONLY for facts about the user that are useful across any project (e.g. timezone, languages, broad preferences).
Skip noise, repetitions, and information that is only useful inside one tool call.
If nothing is worth remembering, return [].`;

export class MemoryExtractor {
  constructor(
    private readonly memoryService: MemoryService = new MemoryService(),
    private readonly messageRepo: MessageRepository = new MessageRepository(),
  ) {}

  /**
   * Extract memories from the last `windowSize` messages of a thread.
   * Idempotency is approximate — caller decides when to invoke (e.g. every N messages).
   */
  async extract(args: {
    agent: AgentRow;
    threadId: string;
    model: BaseChatModel;
    windowSize?: number;
  }): Promise<number> {
    const window = args.windowSize ?? 20;
    const recent = takeTail(this.messageRepo.listByThread(args.threadId, 1000), window);
    if (recent.length === 0) return 0;

    const convo = recent
      .map((m) => `[${m.role}] ${truncate(m.content, 800)}`)
      .join("\n");

    const sys = new SystemMessage(
      `${SYSTEM}\n\n## Agent context\nName: ${args.agent.name}\nRole: ${args.agent.role ?? "(none)"}\nGoal: ${args.agent.goalPrompt}`,
    );
    const human = new HumanMessage(`Conversation window:\n${convo}\n\nReturn JSON array now.`);

    let parsed: ExtractedMemory[] = [];
    try {
      const resp = await args.model.invoke([sys, human]);
      const text = typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content);
      parsed = parseArray(text);
    } catch (err) {
      console.warn("[MemoryExtractor] LLM extraction failed:", err);
      return 0;
    }

    let saved = 0;
    for (const m of parsed) {
      if (!m.content || !m.kind) continue;
      this.memoryService.save({
        agentId: m.crossAgent ? null : args.agent.id,
        kind: m.kind,
        content: m.content.trim(),
        importance: clamp(m.importance ?? 0.5, 0.1, 0.95),
        crossAgent: m.crossAgent ?? false,
        sourceThreadId: args.threadId,
      });
      saved += 1;
    }
    return saved;
  }
}

function parseArray(text: string): ExtractedMemory[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isExtractedMemory).slice(0, 8);
  } catch {
    return [];
  }
}

function isExtractedMemory(x: unknown): x is ExtractedMemory {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o["content"] === "string" &&
    typeof o["kind"] === "string" &&
    ["fact", "preference", "decision", "artifact", "milestone_progress"].includes(o["kind"] as string)
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function takeTail<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

export type { MessageRow };
