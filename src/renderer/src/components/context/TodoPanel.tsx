import { useAppStore } from "@renderer/stores/appStore";

export function TodoPanel() {
  const todos = useAppStore((s) => s.todos);
  const toolEvents = useAppStore((s) => s.toolEvents);

  return (
    <div className="p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-cj-dim">DeepAgent todos</div>
      {todos.length === 0 ? (
        <div className="rounded border border-dashed border-cj-border px-3 py-4 text-xs text-cj-dim">
          The agent hasn't created any planning todos yet. They appear here once it calls <code className="text-cj-accent">write_todos</code>.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {todos.map((t, i) => (
            <li key={i} className="flex items-start gap-2 rounded border border-cj-border bg-cj-panel2 px-2 py-1.5 text-sm">
              <span className={statusDot(t.status)} />
              <span className={t.status === "completed" ? "line-through text-cj-dim" : ""}>{t.content}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 mb-2 text-xs uppercase tracking-wider text-cj-dim">Recent tool activity</div>
      {toolEvents.length === 0 ? (
        <div className="rounded border border-dashed border-cj-border px-3 py-4 text-xs text-cj-dim">
          No tool calls yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {toolEvents.slice(-15).reverse().map((e) => (
            <li key={e.id} className="rounded border border-cj-border bg-cj-panel2 px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-cj-accent">{e.toolName}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-cj-dim" title={e.argsJson}>
                {e.argsJson}
              </div>
              {e.resultPreview ? (
                <div className="mt-1 truncate text-[11px] text-slate-300" title={e.resultPreview}>
                  → {e.resultPreview}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusDot(status: "pending" | "in_progress" | "completed"): string {
  const base = "mt-1 inline-block h-2 w-2 shrink-0 rounded-full";
  if (status === "completed") return `${base} bg-cj-ok`;
  if (status === "in_progress") return `${base} bg-cj-accent animate-pulse`;
  return `${base} bg-cj-dim`;
}
