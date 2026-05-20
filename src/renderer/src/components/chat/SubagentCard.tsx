import { useState } from "react";
import type { SubagentStreamInterface } from "@shared/domain.js";

function getElapsedTime(
  startedAt: number | undefined,
  completedAt: number | undefined
): string | null {
  if (!startedAt) return null;
  const end = completedAt ?? Date.now();
  const seconds = Math.round((end - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function StatusIcon({ status }: { status: SubagentStreamInterface["status"] }) {
  switch (status) {
    case "pending":
      return <span className="text-cj-dim font-bold">○</span>;
    case "running":
      return <span className="animate-spin text-cj-accent font-bold inline-block">◉</span>;
    case "complete":
      return <span className="text-cj-ok font-bold">✓</span>;
    case "error":
      return <span className="text-cj-err font-bold">✕</span>;
  }
}

export function StatusBadge({ status }: { status: SubagentStreamInterface["status"] }) {
  const styles = {
    pending: "bg-cj-panel2 border border-cj-border text-cj-dim",
    running: "bg-cj-accent/10 border border-cj-accent/30 text-cj-accent",
    complete: "bg-cj-ok/10 border border-cj-ok/30 text-cj-ok",
    error: "bg-cj-err/10 border border-cj-err/30 text-cj-err",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${styles[status]}`}>
      {status}
    </span>
  );
}

export function SubagentCard({
  subagent,
}: {
  subagent: SubagentStreamInterface;
}) {
  const [expanded, setExpanded] = useState(true);

  const title =
    subagent.toolCall?.args?.subagent_type ?? `Agent ${subagent.id}`;
  const description = subagent.toolCall?.args?.description ?? "";

  const lastAIMessage = subagent.messages
    .filter((m) => m && (m.type === "ai" || m.type === "AIMessage"))
    .at(-1);

  const displayContent =
    subagent.status === "complete"
      ? subagent.result
      : typeof lastAIMessage?.content === "string"
        ? lastAIMessage.content
        : "";

  const elapsed = getElapsedTime(subagent.startedAt, subagent.completedAt);

  return (
    <div className="rounded-xl border border-cj-border bg-cj-panel2 shadow-panel overflow-hidden transition-all duration-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3.5 hover:bg-cj-border/30 transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <StatusIcon status={subagent.status} />
          <div className="text-left">
            <h4 className="font-semibold text-sm capitalize text-slate-100">{title}</h4>
            {description && (
              <p className="text-xs text-cj-dim line-clamp-1 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {elapsed && (
            <span className="text-xs font-mono text-cj-dim bg-cj-bg px-1.5 py-0.5 rounded border border-cj-border/50">{elapsed}</span>
          )}
          <StatusBadge status={subagent.status} />
        </div>
      </button>

      {expanded && displayContent && (
        <div className="border-t border-cj-border bg-cj-panel/50 px-4 py-3 text-xs text-slate-200 font-mono leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">
          {displayContent}
          {subagent.status === "running" && (
            <span className="inline-block h-3.5 w-1.5 animate-pulse bg-cj-accent ml-1" />
          )}
        </div>
      )}
    </div>
  );
}

export function SubagentProgress({
  subagents,
}: {
  subagents: SubagentStreamInterface[];
}) {
  const completed = subagents.filter((s) => s.status === "complete" || s.status === "error").length;
  const total = subagents.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1.5 bg-cj-panel/20 p-2.5 rounded-lg border border-cj-border/40">
      <div className="flex items-center justify-between text-xs text-cj-dim font-medium">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cj-accent animate-pulse" />
          Subagent progress
        </span>
        <span className="font-mono">
          {completed}/{total} complete
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-cj-border">
        <div
          className="h-full rounded-full bg-cj-accent transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function SynthesisIndicator({
  subagents,
  isLoading,
}: {
  subagents: SubagentStreamInterface[];
  isLoading: boolean;
}) {
  const allComplete =
    subagents.length > 0 &&
    subagents.every((s) => s.status === "complete" || s.status === "error");

  if (!allComplete || !isLoading) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-cj-accent2/5 border border-cj-accent2/20 px-4 py-3 text-sm text-cj-accent2 animate-pulse">
      <span className="animate-spin font-semibold text-base">⟳</span>
      <span>
        Synthesizing results from {subagents.length} subagent
        {subagents.length !== 1 ? "s" : ""}...
      </span>
    </div>
  );
}
