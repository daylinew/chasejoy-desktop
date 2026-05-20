import { useAppStore } from "@renderer/stores/appStore";

export function TodoPanel() {
  const todos = useAppStore((s) => s.todos);
  const toolEvents = useAppStore((s) => s.toolEvents);

  return (
    <div className="space-y-5 p-4">
      <section>
      <div className="mb-2 section-label">Task plan</div>
      {todos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
          Agent todos appear here when the plan starts streaming.
        </div>
      ) : (
        <ul className="space-y-2">
          {todos.map((t, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-cj-border bg-white px-3 py-2 text-sm shadow-sm">
              <span className={statusDot(t.status)} />
              <span className={t.status === "completed" ? "line-through text-cj-dim" : "text-slate-800"}>{t.content}</span>
            </li>
          ))}
        </ul>
      )}
      </section>

      <section>
      <div className="mb-2 section-label">Tool activity</div>
      {toolEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
          No tool calls yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {toolEvents.slice(-15).reverse().map((e) => (
            <li key={e.id} className="rounded-lg border border-cj-border bg-white px-3 py-2 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-cj-accent">{e.toolName}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-cj-dim" title={e.argsJson}>
                {e.argsJson}
              </div>
              {e.resultPreview ? (
                <div className="mt-1 truncate text-[11px] text-slate-600" title={e.resultPreview}>
                  {e.resultPreview}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      </section>
    </div>
  );
}

function statusDot(status: "pending" | "in_progress" | "completed"): string {
  const base = "mt-1 inline-block h-2 w-2 shrink-0 rounded-full";
  if (status === "completed") return `${base} bg-cj-ok`;
  if (status === "in_progress") return `${base} bg-cj-accent animate-pulse`;
  return `${base} bg-cj-dim`;
}
