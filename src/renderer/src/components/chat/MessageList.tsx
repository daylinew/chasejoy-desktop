import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { MessageRow, RunToolEvent, SubagentStreamInterface } from "@shared/domain.js";
import { useAppStore } from "@renderer/stores/appStore";

interface Props {
  messages: MessageRow[];
  streamingBubble: {
    id: string;
    content: string;
    streaming: boolean;
    subagents?: SubagentStreamInterface[];
    toolEvents?: RunToolEvent[];
  } | null;
}

export function MessageList({ messages, streamingBubble }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-7">
      {messages.map((m) => {
        const subagentsList: SubagentStreamInterface[] = m.subagents
          ? JSON.parse(m.subagents)
          : [];
        const runEvents: RunToolEvent[] = m.toolCalls ? JSON.parse(m.toolCalls) : [];
        return (
          <Bubble
            key={m.id}
            role={m.role}
            content={m.content}
            subagents={subagentsList}
            runEvents={runEvents}
          />
        );
      })}
      {streamingBubble && streamingBubble.streaming ? (
        <Bubble
          role="assistant"
          content={streamingBubble.content || "…"}
          streaming
          subagents={streamingBubble.subagents || []}
          runEvents={streamingBubble.toolEvents || []}
        />
      ) : null}
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
  subagents,
  runEvents,
}: {
  role: MessageRow["role"];
  content: string;
  streaming?: boolean;
  subagents: SubagentStreamInterface[];
  runEvents: RunToolEvent[];
}) {
  const isUser = role === "user";
  const isTool = role === "tool";
  const todos = useAppStore((s) => s.todos);
  const files = useAppStore((s) => s.files);

  if (isTool) return null;
  const showActivity = !isUser && streaming;
  const visibleContent = content.trim() === "…" ? "" : content;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(92%,760px)] text-[15px] leading-7 ${
          isUser
            ? "rounded-[18px] bg-zinc-100 px-4 py-2.5 text-slate-800 shadow-sm ring-1 ring-zinc-200/60"
            : "px-1 py-1 text-slate-900"
        }`}
      >
        {showActivity ? (
          <ExecutionActivity
            todos={todos}
            toolEvents={runEvents}
            fileCount={Object.keys(files).length}
            subagents={subagents}
          />
        ) : null}
        {!isUser && !streaming && runEvents.length > 0 ? <RunSummary toolEvents={runEvents} /> : null}
        {visibleContent ? (
          <div className={isUser ? "" : "cj-markdown"}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleContent}</ReactMarkdown>
            {streaming ? <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded bg-cj-accent align-[-2px]" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExecutionActivity({
  todos,
  toolEvents,
  fileCount,
  subagents,
}: {
  todos: { content: string; status: "pending" | "in_progress" | "completed" }[];
  toolEvents: RunToolEvent[];
  fileCount: number;
  subagents: SubagentStreamInterface[];
}) {
  const activeTodo = todos.find((t) => t.status === "in_progress") ?? todos.find((t) => t.status === "pending");
  const visibleTodos = todos.slice(0, 6);
  const latestTools = toolEvents.slice(-8).reverse();
  const runningSubagents = subagents.filter((s) => s.status === "running" || s.status === "pending");
  const hasDetails = activeTodo || latestTools.length > 0 || runningSubagents.length > 0 || fileCount > 0;
  const statusLabel = latestTools[0]?.toolName ? describeTool(latestTools[0].toolName) : activeTodo ? "Planning" : "Thinking";

  return (
    <div className="mb-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 shadow-sm ring-1 ring-white">
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {statusLabel}
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-400 ring-1 ring-zinc-200">
          live
        </span>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-slate-700">
        {!hasDetails ? (
          <ExecutionRow pulse label="Thinking through the next step" />
        ) : null}
        {visibleTodos.map((todo, index) => (
          <ExecutionRow
            key={`${todo.content}-${index}`}
            done={todo.status === "completed"}
            pulse={todo.status === "in_progress"}
            muted={todo.status === "pending"}
            label={todo.status === "in_progress" ? `Planning: ${todo.content}` : todo.content}
          />
        ))}
        {runningSubagents.map((s) => (
          <ExecutionRow
            key={s.id}
            pulse={s.status === "running"}
            muted={s.status === "pending"}
            label={`Delegating to ${s.toolCall?.args?.subagent_type ?? "subagent"}`}
            detail={s.toolCall?.args?.description}
          />
        ))}
        {latestTools.map((e) => (
          <ExecutionRow
            key={e.id}
            done={Boolean(e.resultPreview)}
            pulse={!e.resultPreview}
            label={describeTool(e.toolName)}
            detail={toolTarget(e.argsJson) || previewResult(e.resultPreview)}
          />
        ))}
        {fileCount > 0 ? <ExecutionRow done label={`${fileCount} 个工作区文件已更新`} /> : null}
      </div>
    </div>
  );
}

function ExecutionRow({
  label,
  detail,
  done,
  pulse,
  muted,
}: {
  label: string;
  detail?: string;
  done?: boolean;
  pulse?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${muted ? "text-zinc-400" : "text-slate-700"}`}>
      <span
        className={`mt-2 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
          done
            ? "border-emerald-200 bg-emerald-50"
            : pulse
              ? "border-blue-200 bg-blue-50"
              : "border-zinc-200 bg-zinc-50"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            done ? "bg-emerald-500" : pulse ? "animate-pulse bg-blue-500" : "bg-zinc-300"
          }`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate" title={label}>{label}</div>
        {detail ? (
          <div className="mt-0.5 truncate font-mono text-xs text-zinc-500" title={detail}>
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RunSummary({ toolEvents }: { toolEvents: RunToolEvent[] }) {
  const changedFiles = unique(
    toolEvents
      .filter((e) => e.toolName === "write_file" || e.toolName === "edit_file")
      .map((e) => toolTarget(e.argsJson))
      .filter(Boolean),
  );
  const commands = toolEvents
    .filter((e) => e.toolName === "execute")
    .map((e) => toolTarget(e.argsJson))
    .filter(Boolean);
  const visibleFiles = changedFiles.slice(0, 3);
  const hiddenCount = Math.max(0, changedFiles.length - visibleFiles.length);

  if (changedFiles.length === 0 && commands.length === 0) return null;

  return (
    <div className="mb-4 max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
        <div className="text-sm font-medium text-slate-900">
          {changedFiles.length > 0 ? `已编辑 ${changedFiles.length} 个文件` : "已执行命令"}
        </div>
        <button className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
          审核
        </button>
      </div>
      <div className="px-4 py-3">
      {commands[0] ? (
        <div className="mb-2 truncate text-xs text-zinc-500">
          检查命令 <code className="rounded bg-cj-panel2 px-1 py-0.5 font-mono">{commands[0]}</code>
        </div>
      ) : null}
      {visibleFiles.length > 0 ? (
        <div className="space-y-1.5 text-xs">
          {visibleFiles.map((file) => (
            <ExecutionRow key={file} done label={file} />
          ))}
          {hiddenCount > 0 ? (
            <div className="pl-4 text-zinc-500">还有 {hiddenCount} 个文件</div>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}

function describeTool(toolName: string): string {
  switch (toolName) {
    case "read_file":
      return "Reading";
    case "write_file":
      return "Writing";
    case "edit_file":
      return "Editing";
    case "execute":
      return "Running";
    case "grep":
      return "Searching";
    case "glob":
    case "ls":
      return "Scanning";
    case "internet_search":
      return "Researching";
    case "add_milestone":
    case "update_milestone":
    case "list_milestones":
      return "Planning";
    case "open_path":
      return "Opening";
    default:
      return toolName ? `Using ${toolName}` : "Working";
  }
}

function previewResult(resultPreview: string | undefined): string {
  return resultPreview?.split(/\r?\n/).find(Boolean) ?? "";
}

function toolTarget(argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const value =
      args.file_path ??
      args.path ??
      args.command ??
      args.query ??
      args.pattern ??
      args.title;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
