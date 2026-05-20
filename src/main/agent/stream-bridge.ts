import {
  AIMessage,
  type AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createGraphRunStream } from "@langchain/langgraph";
import { nanoid } from "nanoid";

import type { AgentRow, MessageRow, RunToolEvent, StreamEvent, SubagentStreamInterface } from "@shared/domain.js";
import { AgentRegistry } from "./agent-registry.js";
import { MessageRepository } from "../db/repositories/messages.js";
import { ThreadRepository } from "../db/repositories/threads.js";
import { AlignmentRepository } from "../db/repositories/alignment.js";
import { runSelfCheck } from "./alignment/self-check.js";
import { getSettingsStore } from "../stores/settings-store.js";

interface RunContext {
  threadId: string;
  agent: AgentRow;
  abortController: AbortController;
  toolCallCounter: number;
  toolCallSummaries: string[];
  runToolEvents: RunToolEvent[];
  seenToolCalls: Set<string>;
  seenToolResults: Set<string>;
  lastAssistantText: string;
  fallbackAssistantText: string;
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
 * post-turn jobs (self-check).
 */
export class StreamBridge {
  private readonly active = new Map<string, RunContext>();
  private readonly messageRepo = new MessageRepository();
  private readonly threadRepo = new ThreadRepository();
  private readonly alignmentRepo = new AlignmentRepository();

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
    const modelContent = expandShortContinuation(input.content);

    this.messageRepo.append(thread.id, "user", input.content);
    this.threadRepo.touch(thread.id);

    const ctx: RunContext = {
      threadId: thread.id,
      agent: agentRow,
      abortController: new AbortController(),
      toolCallCounter: 0,
      toolCallSummaries: [],
      runToolEvents: [],
      seenToolCalls: new Set(),
      seenToolResults: new Set(),
      lastAssistantText: "",
      fallbackAssistantText: "",
    };
    this.active.set(thread.id, ctx);

    const checkpointConfig = {
      configurable: { thread_id: thread.id },
      metadata: { assistantId: agentRow.id },
    };
    const hasCheckpoint = await bundle.checkpointer.getTuple(checkpointConfig).then(Boolean);
    const messages = hasCheckpoint ? [new HumanMessage(modelContent)] : this.loadMessages(thread.id, modelContent);

    let assistantBuffer = "";
    const assistantMessageId = nanoid(14);

    const subagentsList: SubagentStreamInterface[] = [];

    try {
      const rawStream = await (bundle.agent as unknown as {
        stream: (
          input: { messages: BaseMessage[] },
          opts: {
            subgraphs: boolean;
            streamMode: string[];
            signal: AbortSignal;
            configurable: { thread_id: string };
            metadata: { assistantId: string };
          },
        ) => any;
      }).stream(
        { messages },
        {
          ...checkpointConfig,
          subgraphs: true,
          streamMode: ["values", "updates", "messages", "tools"],
          signal: ctx.abortController.signal,
        },
      );

      const run = createGraphRunStream(
        rawStream as any,
        (bundle.agent.graph as any).streamTransformers,
        { abortController: ctx.abortController }
      );

      const valuesLoop = async () => {
        for await (const values of run.values) {
          this.handleUpdates(
            ctx,
            { values },
            assistantMessageId,
            (text) => {
              assistantBuffer += text;
            },
          );
        }
      };

      const messagesLoop = async () => {
        for await (const message of run.messages) {
          await Promise.all([
            (async () => {
              for await (const delta of message.text) {
                if (!delta) continue;
                assistantBuffer += delta;
                ctx.lastAssistantText += delta;
                this.emit({
                  type: "message_delta",
                  agentId: agentRow.id,
                  threadId: thread.id,
                  messageId: assistantMessageId,
                  role: "assistant",
                  deltaContent: delta,
                });
              }
            })(),
            (async () => {
              for await (const call of message.toolCalls) {
                this.recordToolCall(ctx, {
                  id: call.id,
                  name: call.name,
                  args: call.args ?? call.input,
                });
              }
            })(),
          ]);
        }
      };

      const subagentsLoop = async () => {
        for await (const subagent of (run as any).subagents) {
          const subagentId = subagent.id;
          const initial: SubagentStreamInterface = {
            id: subagentId,
            status: "pending",
            messages: [],
            result: undefined,
            toolCall: {
              id: subagent.toolCall?.id ?? "",
              name: subagent.toolCall?.name ?? "",
              args: {
                subagent_type: subagent.name,
                description: "",
              },
            },
            startedAt: undefined,
            completedAt: undefined,
          };
          subagentsList.push(initial);

          const updateAndEmit = (updates: Partial<SubagentStreamInterface>) => {
            const idx = subagentsList.findIndex((s) => s.id === subagentId);
            if (idx >= 0) {
              subagentsList[idx] = { ...subagentsList[idx]!, ...updates };
              this.emit({
                type: "subagent_update",
                agentId: agentRow.id,
                threadId: thread.id,
                subagent: subagentsList[idx]!,
              });
            }
          };

          // Emit initial state
          updateAndEmit({});

          // Handle task input description
          void subagent.taskInput.then((desc: string) => {
            const idx = subagentsList.findIndex((s) => s.id === subagentId);
            const tc = subagentsList[idx]?.toolCall;
            updateAndEmit({
              status: "running",
              startedAt: Date.now(),
              toolCall: tc
                ? {
                    ...tc,
                    args: { ...tc.args, description: desc },
                  }
                : undefined,
            });
          }).catch(() => {});

          // Track messages inside the subagent
          const trackMessages = async () => {
            for await (const msg of subagent.messages) {
              const idx = subagentsList.findIndex((s) => s.id === subagentId);
              if (idx >= 0) {
                const currentMsgs = subagentsList[idx]!.messages;
                const plainMsg = {
                  type: msg.type,
                  content: msg.content,
                };
                updateAndEmit({
                  messages: [...currentMsgs, plainMsg],
                });
              }
            }
          };
          void trackMessages();

          // Handle subagent output / completion
          void subagent.output.then((out: any) => {
            const idx = subagentsList.findIndex((s) => s.id === subagentId);
            if (idx >= 0) {
              const finalMsg = out?.messages?.filter((m: any) => m && (m._llmType || m.content))?.at(-1);
              const resultText = finalMsg ? (typeof finalMsg.content === "string" ? finalMsg.content : "") : "";
              updateAndEmit({
                status: "complete",
                result: resultText || out?.result || "",
                completedAt: Date.now(),
              });
            }
          }).catch((err: Error) => {
            updateAndEmit({
              status: "error",
              completedAt: Date.now(),
            });
          });
        }
      };

      await Promise.all([valuesLoop(), messagesLoop(), subagentsLoop()]);
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

    if (assistantBuffer.length === 0 && ctx.fallbackAssistantText) {
      assistantBuffer = ctx.fallbackAssistantText;
      this.emit({
        type: "message_delta",
        agentId: agentRow.id,
        threadId: thread.id,
        messageId: assistantMessageId,
        role: "assistant",
        deltaContent: assistantBuffer,
      });
    }

    if (assistantBuffer.length > 0) {
      const finalText = assistantBuffer;
      const final = this.messageRepo.append(thread.id, "assistant", assistantBuffer, ctx.runToolEvents, subagentsList);
      this.emit({
        type: "message_complete",
        agentId: agentRow.id,
        threadId: thread.id,
        messageId: final.id,
        role: "assistant",
        content: finalText,
        toolCalls: ctx.runToolEvents,
        subagents: subagentsList,
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

  private loadMessages(threadId: string, latestUserOverride?: string): BaseMessage[] {
    const rows: MessageRow[] = this.messageRepo.listByThread(threadId, 1000);
    return rows.map((r, index) => {
      const content =
        latestUserOverride && index === rows.length - 1 && r.role === "user"
          ? latestUserOverride
          : r.content;
      switch (r.role) {
        case "user":
          return new HumanMessage(content);
        case "assistant":
          return new AIMessageStub(content);
        case "tool":
          return new ToolMessageStub(content, r.id);
        case "system":
        default:
          return new HumanMessage(content);
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
      if (text) ctx.fallbackAssistantText = text;
      const toolCalls = (ai as { tool_calls?: { id?: string; name?: string; args?: unknown }[] }).tool_calls ?? [];
      for (const call of toolCalls) {
        this.recordToolCall(ctx, call);
      }
    } else if (typeName === "tool" || typeName === "ToolMessage") {
      const tm = m as ToolMessage;
      const content = typeof tm.content === "string" ? tm.content : flattenContent(tm.content);
      this.recordToolResult(ctx, tm.tool_call_id ?? nanoid(8), content);
    }
  }

  private recordToolCall(
    ctx: RunContext,
    call: { id?: string; name?: string; args?: unknown; input?: unknown },
  ): void {
    const toolCallId = call.id ?? nanoid(8);
    if (ctx.seenToolCalls.has(toolCallId)) return;
    ctx.seenToolCalls.add(toolCallId);

    ctx.toolCallCounter += 1;
    const argsJson = safeJson(call.args ?? call.input);
    const toolName = call.name ?? "(unknown)";
    ctx.runToolEvents.push({
      id: toolCallId,
      toolName,
      argsJson,
    });
    ctx.toolCallSummaries.push(`${toolName}(${truncate(argsJson, 80)})`);
    this.emit({
      type: "tool_call",
      agentId: ctx.agent.id,
      threadId: ctx.threadId,
      toolCallId,
      toolName,
      argsJson,
    });
  }

  private recordToolResult(ctx: RunContext, toolCallId: string, content: string): void {
    if (ctx.seenToolResults.has(toolCallId)) return;
    ctx.seenToolResults.add(toolCallId);
    const resultPreview = truncate(content, 400);
    ctx.runToolEvents = ctx.runToolEvents.map((e) =>
      e.id === toolCallId ? { ...e, resultPreview } : e,
    );
    this.emit({
      type: "tool_result",
      agentId: ctx.agent.id,
      threadId: ctx.threadId,
      toolCallId,
      resultPreview,
    });
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

    /*
     * Long-term memory is handled by DeepAgents' native filesystem-backed
     * memory at /memories/AGENTS.md. Post-turn work stays product-specific.
     */
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

function expandShortContinuation(content: string): string {
  const trimmed = content.trim();
  if (!/^(继续|继续执行|开始|开始执行|go on|continue|proceed)$/i.test(trimmed)) return content;
  return [
    content,
    "",
    "Continue executing the current active goal or milestone now.",
    "Do not merely acknowledge this instruction.",
    "Use the available tools in this turn to create, edit, inspect, or verify the actual artifact.",
    "If the current goal is to build a webpage/app/document, write the real file(s) first, then summarize the result and paths.",
  ].join("\n");
}
