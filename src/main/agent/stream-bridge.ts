import {
  AIMessage,
  type AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { nanoid } from "nanoid";

import type { AgentRow, MessageRow, StreamEvent } from "@shared/domain.js";
import { AgentRegistry } from "./agent-registry.js";
import { MessageRepository } from "../db/repositories/messages.js";
import { ThreadRepository } from "../db/repositories/threads.js";
import { AlignmentRepository } from "../db/repositories/alignment.js";
import { runSelfCheck } from "./alignment/self-check.js";
import { MemoryExtractor } from "./memory/memory-extractor.js";
import { getSettingsStore } from "../stores/settings-store.js";

interface RunContext {
  threadId: string;
  agent: AgentRow;
  abortController: AbortController;
  toolCallCounter: number;
  toolCallSummaries: string[];
  lastAssistantText: string;
}

class AIMessageStub extends AIMessage {
  constructor(content: string) {
    super({ content });
  }
}

class ToolMessageStub extends ToolMessage {
  constructor(content: string, id: string) {
    super({ content, tool_call_id: id });
  }
}

/**
 * Owns the lifecycle of a single chat.stream IPC call.
 * Persists messages, fans out StreamEvents to the renderer, and triggers
 * post-turn jobs (self-check + memory extractor).
 */
export class StreamBridge {
  private readonly active = new Map<string, RunContext>();
  private readonly messageRepo = new MessageRepository();
  private readonly threadRepo = new ThreadRepository();
  private readonly alignmentRepo = new AlignmentRepository();
  private readonly memoryExtractor = new MemoryExtractor();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly emit: (event: StreamEvent) => void,
  ) {}

  cancel(threadId: string): void {
    this.active.get(threadId)?.abortController.abort();
  }

  async run(input: { threadId: string; content: string }): Promise<void> {
    const thread = this.threadRepo.requireById(input.threadId);
    const agentRow = this.registry.agentForThread(thread.id);
    const bundle = this.registry.getRuntime(agentRow.id);
    bundle.setActiveThread(thread.id);

    this.messageRepo.append(thread.id, "user", input.content);
    this.threadRepo.touch(thread.id);

    const ctx: RunContext = {
      threadId: thread.id,
      agent: agentRow,
      abortController: new AbortController(),
      toolCallCounter: 0,
      toolCallSummaries: [],
      lastAssistantText: "",
    };
    this.active.set(thread.id, ctx);

    const messages = this.loadMessages(thread.id);

    let assistantBuffer = "";
    const assistantMessageId = nanoid(14);

    try {
      const stream = await (bundle.agent as unknown as {
        stream: (
          input: { messages: BaseMessage[] },
          opts: { streamMode: ["values", "updates"]; signal: AbortSignal },
        ) => AsyncIterable<[mode: string, chunk: unknown]>;
      }).stream(
        { messages },
        { streamMode: ["values", "updates"], signal: ctx.abortController.signal },
      );

      for await (const [mode, chunk] of stream) {
        if (mode === "updates") {
          this.handleUpdates(ctx, chunk as Record<string, unknown>, assistantMessageId, (text) => {
            assistantBuffer += text;
          });
        }
      }
    } catch (err) {
      const e = err as Error;
      this.emit({
        type: "error",
        agentId: agentRow.id,
        threadId: thread.id,
        message: e.message ?? String(e),
      });
    } finally {
      this.active.delete(thread.id);
    }

    if (assistantBuffer.length > 0) {
      const final = this.messageRepo.append(thread.id, "assistant", assistantBuffer);
      this.emit({
        type: "message_complete",
        agentId: agentRow.id,
        threadId: thread.id,
        messageId: final.id,
        role: "assistant",
        content: assistantBuffer,
      });
    }

    this.emit({ type: "done", agentId: agentRow.id, threadId: thread.id });

    void this.runPostTurnJobs(ctx, bundle.model, assistantBuffer);
  }

  async realign(_agentId: string, threadId: string): Promise<void> {
    const realignText =
      "Pause and re-align with the project goal. " +
      "Review the goal anchor at the top of your system prompt, list your current milestones, " +
      "then write a fresh todo plan that demonstrably moves us toward the goal. Do this before any further tool calls.";
    await this.run({ threadId, content: realignText });
  }

  /* ---------- internals ---------- */

  private loadMessages(threadId: string): BaseMessage[] {
    const rows: MessageRow[] = this.messageRepo.listByThread(threadId, 1000);
    return rows.map((r) => {
      switch (r.role) {
        case "user":
          return new HumanMessage(r.content);
        case "assistant":
          return new AIMessageStub(r.content);
        case "tool":
          return new ToolMessageStub(r.content, r.id);
        case "system":
        default:
          return new HumanMessage(r.content);
      }
    });
  }

  private handleUpdates(
    ctx: RunContext,
    chunk: Record<string, unknown>,
    assistantMessageId: string,
    bufferAppend: (s: string) => void,
  ): void {
    for (const [, value] of Object.entries(chunk)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;

      if (Array.isArray(v["messages"])) {
        for (const m of v["messages"] as BaseMessage[]) {
          this.processMessage(ctx, m, assistantMessageId, bufferAppend);
        }
      }

      if (Array.isArray(v["todos"])) {
        this.emit({
          type: "todos",
          agentId: ctx.agent.id,
          threadId: ctx.threadId,
          todos: v["todos"] as { content: string; status: "pending" | "in_progress" | "completed" }[],
        });
      }

      if (v["files"] && typeof v["files"] === "object") {
        const filesObj = v["files"] as Record<string, unknown>;
        const flat: Record<string, string> = {};
        for (const [k, fd] of Object.entries(filesObj)) {
          if (fd && typeof fd === "object" && "content" in (fd as object)) {
            const c = (fd as { content: unknown }).content;
            flat[k] = Array.isArray(c) ? c.join("\n") : String(c ?? "");
          }
        }
        this.emit({
          type: "files",
          agentId: ctx.agent.id,
          threadId: ctx.threadId,
          files: flat,
        });
      }
    }
  }

  private processMessage(
    ctx: RunContext,
    m: BaseMessage,
    assistantMessageId: string,
    bufferAppend: (s: string) => void,
  ): void {
    const typeName = (m as { _getType?: () => string })._getType?.() ?? m.constructor.name;

    if (typeName === "ai" || typeName === "AIMessage" || typeName === "AIMessageChunk") {
      const ai = m as AIMessage | AIMessageChunk;
      const text = typeof ai.content === "string" ? ai.content : flattenContent(ai.content);
      if (text) {
        bufferAppend(text);
        ctx.lastAssistantText = text;
        this.emit({
          type: "message_delta",
          agentId: ctx.agent.id,
          threadId: ctx.threadId,
          messageId: assistantMessageId,
          role: "assistant",
          deltaContent: text,
        });
      }

      const toolCalls = (ai as { tool_calls?: { id?: string; name?: string; args?: unknown }[] }).tool_calls ?? [];
      for (const call of toolCalls) {
        ctx.toolCallCounter += 1;
        const argsJson = safeJson(call.args);
        ctx.toolCallSummaries.push(`${call.name}(${truncate(argsJson, 80)})`);
        this.emit({
          type: "tool_call",
          agentId: ctx.agent.id,
          threadId: ctx.threadId,
          toolCallId: call.id ?? nanoid(8),
          toolName: call.name ?? "(unknown)",
          argsJson,
        });
      }
    } else if (typeName === "tool" || typeName === "ToolMessage") {
      const tm = m as ToolMessage;
      const content = typeof tm.content === "string" ? tm.content : flattenContent(tm.content);
      this.emit({
        type: "tool_result",
        agentId: ctx.agent.id,
        threadId: ctx.threadId,
        toolCallId: tm.tool_call_id ?? nanoid(8),
        resultPreview: truncate(content, 400),
      });
    }
  }

  private async runPostTurnJobs(
    ctx: RunContext,
    evaluatorModel: BaseChatModel,
    assistantText: string,
  ): Promise<void> {
    const settings = getSettingsStore().getMeta();

    if (ctx.toolCallCounter >= settings.alignmentSelfCheckEveryN) {
      try {
        const { score, reasoning } = await runSelfCheck({
          agent: ctx.agent,
          model: evaluatorModel,
          recentToolSummary: ctx.toolCallSummaries.slice(-8).join("\n"),
          recentAssistantText: assistantText,
        });
        this.alignmentRepo.log(ctx.agent.id, ctx.threadId, score, reasoning);
        this.emit({
          type: "alignment",
          agentId: ctx.agent.id,
          threadId: ctx.threadId,
          score,
          reasoning,
        });
      } catch (err) {
        console.warn("[StreamBridge] self-check failed:", err);
      }
    }

    const total = this.messageRepo.countByThread(ctx.threadId);
    if (total > 0 && total % settings.memoryExtractEveryN === 0) {
      try {
        await this.memoryExtractor.extract({
          agent: ctx.agent,
          threadId: ctx.threadId,
          model: evaluatorModel,
          windowSize: settings.memoryExtractEveryN + 4,
        });
      } catch (err) {
        console.warn("[StreamBridge] memory extraction failed:", err);
      }
    }
  }
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
      .join("");
  }
  return "";
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return "{}";
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
