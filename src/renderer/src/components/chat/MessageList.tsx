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
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-7">
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
        className={`max-w-[92%] text-[15px] leading-7 ${
          isUser
            ? "rounded-2xl bg-zinc-100 px-4 py-2.5 text-slate-800"
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

  return (
    <div className="mb-4 w-full max-w-2xl rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="space-y-2 text-sm text-slate-700">
        {!hasDetails ? (
          <ExecutionRow pulse label="正在分析请求" />
        ) : null}
        {visibleTodos.map((todo, index) => (
          <ExecutionRow
            key={`${todo.content}-${index}`}
            done={todo.status === "completed"}
            pulse={todo.status === "in_progress"}
            muted={todo.status === "pending"}
            label={todo.content}
          />
        ))}
        {runningSubagents.map((s) => (
          <ExecutionRow
            key={s.id}
            pulse={s.status === "running"}
            muted={s.status === "pending"}
            label={`委派 ${s.toolCall?.args?.subagent_type ?? "子任务"}`}
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
        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
          done ? "bg-cj-ok" : pulse ? "animate-pulse bg-cj-accent" : "bg-slate-300"
        }`}
      />
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
    <div className="mb-4 max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
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
      return "读取文件";
    case "write_file":
      return "创建文件";
    case "edit_file":
      return "编辑文件";
    case "execute":
      return "运行命令";
    case "grep":
      return "搜索代码";
    case "glob":
    case "ls":
      return "扫描文件";
    case "internet_search":
      return "搜索网页";
    case "add_milestone":
    case "update_milestone":
    case "list_milestones":
      return "更新计划";
    case "open_path":
      return "打开文件";
    default:
      return toolName ? `调用 ${toolName}` : "执行中";
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
