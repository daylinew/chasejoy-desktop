import { useAppStore } from "@renderer/stores/appStore";

export function TodoPanel() {
  const todos = useAppStore((s) => s.todos);
  const toolEvents = useAppStore((s) => s.toolEvents);

  return (
    <div className="space-y-5 p-4">
      <section>
        <div className="mb-2 section-label">Plan</div>
        {todos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
            The assistant will show its plan here when a task needs multiple steps.
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
        <div className="mb-2 section-label">Actions</div>
        {toolEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
            No visible actions yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {toolEvents.slice(-15).reverse().map((e) => (
              <li key={e.id} className="rounded-lg border border-cj-border bg-white px-3 py-2 text-xs shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{describeTool(e.toolName, e.argsJson)}</span>
                  <span className={`h-2 w-2 rounded-full ${e.resultPreview ? "bg-cj-ok" : "animate-pulse bg-cj-accent"}`} />
                </div>
                {toolTarget(e.argsJson) ? (
                  <div className="mt-0.5 truncate text-[11px] text-cj-dim" title={toolTarget(e.argsJson)}>
                    {toolTarget(e.argsJson)}
                  </div>
                ) : null}
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

function describeTool(toolName: string, argsJson: string): string {
  switch (toolName) {
    case "read_file":
      return "Reading a file";
    case "write_file":
      return "Creating a file";
    case "edit_file":
      return "Editing a file";
    case "execute":
      return "Running a command";
    case "grep":
      return "Searching text";
    case "glob":
    case "ls":
      return "Scanning files";
    case "internet_search":
      return "Searching the web";
    case "add_milestone":
    case "update_milestone":
    case "list_milestones":
      return "Updating the plan";
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
