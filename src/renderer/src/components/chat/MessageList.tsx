import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { MessageRow, RunToolEvent, SubagentStreamInterface } from "@shared/domain.js";
import { useAppStore } from "@renderer/stores/appStore";
import { SubagentCard, SubagentProgress } from "./SubagentCard";

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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

  if (isTool) return null; // Tool messages are surfaced in the right panel instead.
  const showActivity = !isUser && streaming;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed shadow-panel ${
          isUser
            ? "bg-cj-accent text-white"
            : "border border-cj-border bg-white text-slate-800"
        }`}
      >
        <div className={`mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider ${isUser ? "text-blue-100" : "text-cj-dim"}`}>
          <span>{isUser ? "You" : "Agent"}</span>
          {streaming ? <span className={isUser ? "text-white" : "text-cj-accent"}>writing...</span> : null}
        </div>
        {showActivity ? (
          <ExecutionActivity
            todos={todos}
            toolEvents={runEvents}
            fileCount={Object.keys(files).length}
            subagents={subagents}
          />
        ) : null}
        {!isUser && !streaming && runEvents.length > 0 ? <RunSummaryCard toolEvents={runEvents} /> : null}
        <div className="cj-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          {streaming ? <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded bg-cj-accent align-[-2px]" /> : null}
        </div>

        {subagents && subagents.length > 0 && (
          <div className="mt-4 space-y-3 border-l border-cj-accent/20 pl-3">
            <SubagentProgress subagents={subagents} />
            {subagents.map((subagent) => (
              <SubagentCard key={subagent.id} subagent={subagent} />
            ))}
          </div>
        )}
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
  const latestTools = toolEvents.slice(-3).reverse();
  const runningSubagents = subagents.filter((s) => s.status === "running" || s.status === "pending");
  const hasDetails = activeTodo || latestTools.length > 0 || runningSubagents.length > 0 || fileCount > 0;

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-slate-700">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-900">Working</span>
        <span className="flex items-center gap-1 text-cj-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cj-accent" />
          live
        </span>
      </div>
      {!hasDetails ? <div className="text-cj-dim">Thinking through the next step...</div> : null}
      {activeTodo ? (
        <div className="truncate" title={activeTodo.content}>
          {activeTodo.status === "in_progress" ? "Now: " : "Next: "}
          {activeTodo.content}
        </div>
      ) : null}
      {runningSubagents.map((s) => (
        <div key={s.id} className="truncate text-cj-dim" title={s.toolCall?.args?.description}>
          Delegating: {s.toolCall?.args?.subagent_type ?? "assistant task"}
        </div>
      ))}
      {latestTools.map((e) => (
        <div key={e.id} className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${e.resultPreview ? "bg-cj-ok" : "animate-pulse bg-cj-accent"}`} />
          <span className="truncate" title={toolTarget(e.argsJson)}>
            {describeTool(e.toolName)}
            {toolTarget(e.argsJson) ? ` · ${toolTarget(e.argsJson)}` : ""}
          </span>
        </div>
      ))}
      {fileCount > 0 ? <div className="text-cj-dim">{fileCount} workspace file{fileCount === 1 ? "" : "s"} updated</div> : null}
    </div>
  );
}

function RunSummaryCard({ toolEvents }: { toolEvents: RunToolEvent[] }) {
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
    <div className="mb-3 overflow-hidden rounded-xl border border-cj-border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-cj-border px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {changedFiles.length > 0 ? `Edited ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}` : "Ran command"}
          </div>
          {commands[0] ? (
            <div className="mt-0.5 text-xs text-cj-dim">
              Check: <code className="rounded bg-cj-panel2 px-1 py-0.5 font-mono">{commands[0]}</code>
            </div>
          ) : null}
        </div>
        {changedFiles.length > 0 ? (
          <button className="btn-ghost px-2 py-1 text-xs" title="Diff review will be connected next">
            Review
          </button>
        ) : null}
      </div>
      {visibleFiles.length > 0 ? (
        <div className="divide-y divide-cj-border text-xs">
          {visibleFiles.map((file) => (
            <div key={file} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate font-mono text-slate-700" title={file}>{file}</span>
              <span className="shrink-0 text-cj-dim">updated</span>
            </div>
          ))}
          {hiddenCount > 0 ? (
            <div className="px-3 py-2 text-cj-dim">Show {hiddenCount} more file{hiddenCount === 1 ? "" : "s"}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function describeTool(toolName: string): string {
  switch (toolName) {
    case "read_file":
      return "Reading";
    case "write_file":
      return "Creating";
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
      return "Searching web";
    case "add_milestone":
    case "update_milestone":
    case "list_milestones":
      return "Updating plan";
    default:
      return toolName ? `Using ${toolName}` : "Working";
  }
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
