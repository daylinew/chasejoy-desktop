import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { nanoid } from "nanoid";

import type { AgentRow, AgentRunContext, MessageRow, RunToolEvent, StreamEvent, SubagentStreamInterface } from "@shared/domain.js";
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

interface PersistedMessageMeta {
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
  id?: string;
}

const MAX_AUTO_CONTINUE_RUNS = 2;
const CONCRETE_TOOL_NAMES = new Set([
  "write_file",
  "edit_file",
  "execute",
  "clipboard_write",
  "take_screenshot",
]);

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

  async run(input: { threadId: string; content: string; context?: AgentRunContext }): Promise<void> {
    const thread = this.threadRepo.requireById(input.threadId);
    const agentRow = this.registry.agentForThread(thread.id);
    const bundle = this.registry.getRuntime(agentRow.id);
    bundle.setActiveThread(thread.id);
    const modelContent = expandShortContinuation(input.content);
    const previousAssistantText = this.messageRepo.latestAssistantContent(thread.id);

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
    let latestStateMessages: BaseMessage[] = [];

    const consumeStream = async (messagesForRun: BaseMessage[]) => {
      ctx.fallbackAssistantText = "";
      const run = await (bundle.agent as unknown as {
        streamEvents: (
          input: { messages: BaseMessage[] },
          opts: {
            version: "v3";
            signal: AbortSignal;
            context?: AgentRunContext;
            configurable: { thread_id: string };
            metadata: { assistantId: string };
          },
        ) => any;
      }).streamEvents(
        { messages: messagesForRun },
        {
          ...checkpointConfig,
          context: input.context,
          version: "v3",
          signal: ctx.abortController.signal,
        },
      );

      const valuesLoop = async () => {
        for await (const values of run.values) {
          if (values && typeof values === "object" && Array.isArray((values as Record<string, unknown>)["messages"])) {
            latestStateMessages = (values as Record<string, unknown>)["messages"] as BaseMessage[];
          }
          this.handleUpdates(ctx, { values });
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

      const toolCallsLoop = async () => {
        const resultWaits: Promise<void>[] = [];
        for await (const call of run.toolCalls ?? []) {
          this.recordToolCall(ctx, {
            id: call.callId,
            name: call.name,
            args: call.input,
          });
          const resultWait = Promise.resolve(call.output)
            .then((output) => {
              this.recordToolResult(ctx, call.callId, stringifyToolOutput(output));
            })
            .catch((err) => {
              this.recordToolResult(ctx, call.callId, (err as Error).message ?? String(err));
            });
          resultWaits.push(resultWait);
        }
        await Promise.allSettled(resultWaits);
      };

      const subagentsLoop = async () => {
        for await (const subagent of (run as any).subagents) {
          const subagentId = subagent.id ?? `${subagent.name ?? "subagent"}-${subagentsList.length + 1}`;
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

      await Promise.all([valuesLoop(), messagesLoop(), toolCallsLoop(), subagentsLoop()]);

      if (assistantBuffer.length === 0) {
        ctx.fallbackAssistantText = extractAssistantAfterUserContent(latestStateMessages, modelContent, input.content);
      }
    };

    let streamFailed = false;
    try {
      await consumeStream(messages);
    } catch (err) {
      const e = err as Error;
      streamFailed = true;
      this.emit({
        type: "error",
        agentId: agentRow.id,
        threadId: thread.id,
        message: e.message ?? String(e),
      });
    }

    if (!streamFailed && assistantBuffer.length === 0 && ctx.fallbackAssistantText) {
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

    for (
      let attempt = 0;
      !streamFailed
        && !ctx.abortController.signal.aborted
        && attempt < MAX_AUTO_CONTINUE_RUNS
        && shouldAutoContinueRun(input.content, assistantBuffer, ctx.runToolEvents);
      attempt += 1
    ) {
      const autoPrompt = buildAutoContinuePrompt(input.content, assistantBuffer, ctx.runToolEvents);
      const spacer = assistantBuffer.endsWith("\n\n") ? "" : "\n\n";
      if (spacer) {
        assistantBuffer += spacer;
        this.emit({
          type: "message_delta",
          agentId: agentRow.id,
          threadId: thread.id,
          messageId: assistantMessageId,
          role: "assistant",
          deltaContent: spacer,
        });
      }
      try {
        await consumeStream([new HumanMessage(autoPrompt)]);
      } catch (err) {
        const e = err as Error;
        streamFailed = true;
        this.emit({
          type: "error",
          agentId: agentRow.id,
          threadId: thread.id,
          message: e.message ?? String(e),
        });
      }
    }

    this.active.delete(thread.id);

    const usingFallbackText = assistantBuffer.length === 0 && Boolean(ctx.fallbackAssistantText);
    if (usingFallbackText) assistantBuffer = ctx.fallbackAssistantText;

    if (
      assistantBuffer.trim() &&
      previousAssistantText &&
      assistantBuffer.trim() === previousAssistantText.trim() &&
      ctx.runToolEvents.length === 0
    ) {
      assistantBuffer = "";
    }

    if (usingFallbackText && assistantBuffer.length > 0) {
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
      const finalMessage =
        findLatestAssistantMessage(latestStateMessages) ??
        findAssistantAfterUserMessage(latestStateMessages, modelContent, input.content);
      const final = this.messageRepo.append(
        thread.id,
        "assistant",
        assistantBuffer,
        ctx.runToolEvents,
        subagentsList,
        finalMessage ? messageMetaFromBaseMessage(finalMessage) : undefined,
      );
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
        case "assistant": {
          const meta = parseMessageMeta(r.messageMeta);
          return new AIMessage({
            content,
            id: meta?.id,
            additional_kwargs: meta?.additional_kwargs ?? {},
            response_metadata: meta?.response_metadata ?? {},
          });
        }
        case "tool":
          return new ToolMessageStub(content, r.id);
        case "system":
        default:
          return new HumanMessage(content);
      }
    });
  }

  private handleUpdates(ctx: RunContext, chunk: Record<string, unknown>): void {
    for (const [, value] of Object.entries(chunk)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;

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

function messageType(m: BaseMessage): string {
  return (m as { _getType?: () => string })._getType?.() ?? m.constructor.name;
}

function messageContent(m: BaseMessage): string {
  return typeof m.content === "string" ? m.content : flattenContent(m.content);
}

function extractAssistantAfterUserContent(
  messages: BaseMessage[],
  modelContent: string,
  displayContent: string,
): string {
  const message = findAssistantAfterUserMessage(messages, modelContent, displayContent);
  return message ? messageContent(message).trim() : "";
}

function findLatestAssistantMessage(messages: BaseMessage[]): BaseMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const typeName = messageType(m);
    if (typeName !== "ai" && typeName !== "AIMessage" && typeName !== "AIMessageChunk") continue;
    if (messageContent(m).trim()) return m;
  }
  return null;
}

function findAssistantAfterUserMessage(
  messages: BaseMessage[],
  modelContent: string,
  displayContent: string,
): BaseMessage | null {
  const userCandidates = new Set([modelContent.trim(), displayContent.trim()].filter(Boolean));
  let latestUserIndex = -1;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const typeName = messageType(m);
    if (typeName !== "human" && typeName !== "HumanMessage") continue;
    const text = messageContent(m).trim();
    if (userCandidates.has(text)) {
      latestUserIndex = i;
      break;
    }
  }

  if (latestUserIndex < 0) return null;

  for (let i = latestUserIndex + 1; i < messages.length; i++) {
    const m = messages[i]!;
    const typeName = messageType(m);
    if (typeName === "ai" || typeName === "AIMessage" || typeName === "AIMessageChunk") {
      const text = messageContent(m).trim();
      if (text) return m;
    }
  }
  return null;
}

function messageMetaFromBaseMessage(message: BaseMessage): PersistedMessageMeta | undefined {
  const raw = message as BaseMessage & {
    additional_kwargs?: Record<string, unknown>;
    response_metadata?: Record<string, unknown>;
    id?: string;
  };
  const meta: PersistedMessageMeta = {};
  if (raw.id) meta.id = raw.id;
  if (raw.additional_kwargs && Object.keys(raw.additional_kwargs).length > 0) {
    meta.additional_kwargs = raw.additional_kwargs;
  }
  if (raw.response_metadata && Object.keys(raw.response_metadata).length > 0) {
    meta.response_metadata = raw.response_metadata;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function parseMessageMeta(raw: string | null | undefined): PersistedMessageMeta | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as PersistedMessageMeta;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return "{}";
  }
}

function stringifyToolOutput(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function shouldAutoContinueRun(
  userContent: string,
  assistantText: string,
  toolEvents: RunToolEvent[],
): boolean {
  const text = assistantText.trim();
  if (!text) return false;
  if (toolEvents.some((event) => CONCRETE_TOOL_NAMES.has(event.toolName))) return false;
  if (/\b(done|completed|finished|created|updated|saved|written)\b/i.test(text)) return false;
  if (/已完成|已经完成|已生成|已创建|已保存|写好了|完成了/.test(text)) return false;

  const artifactIntent =
    /生成|创建|制作|编写|修改|写|报告|表格|xlsx|excel|html|网页|文件|代码|测试|打开|create|write|generate|build|make|edit|modify|report|spreadsheet|file|page|app|test/i
      .test(userContent);
  if (!artifactIntent) return false;

  return /正在|准备|将会|接下来|下一步|开始|继续|生成中|处理中|我会|我将|需要|thinking|working|preparing|generating|processing|next step|i'?ll|i will|i'm going/i
    .test(text);
}

function buildAutoContinuePrompt(
  userContent: string,
  assistantText: string,
  toolEvents: RunToolEvent[],
): string {
  const recentTools = toolEvents.length > 0
    ? toolEvents.slice(-6).map((event) => `- ${event.toolName}: ${truncate(event.argsJson, 200)}`).join("\n")
    : "- No concrete tool-backed work has happened yet.";
  return [
    "Continue executing the user's request now.",
    "",
    "Your previous response looked like work-in-progress. Do not restate the plan.",
    "Use the available tools to inspect, create, edit, run, or verify the actual artifact.",
    "If the user requested a report, document, webpage, spreadsheet, code change, or test, produce the real file/work before summarizing.",
    "",
    "Original user request:",
    truncate(userContent, 1200),
    "",
    "Previous assistant response:",
    truncate(assistantText, 1200),
    "",
    "Recent tool activity:",
    recentTools,
  ].join("\n");
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
