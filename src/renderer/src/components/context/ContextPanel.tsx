import { useAppStore } from "@renderer/stores/appStore";

import { TodoPanel } from "./TodoPanel";
import { FilesPanel } from "./FilesPanel";

const TABS: { key: "todos" | "files"; label: string }[] = [
  { key: "todos", label: "Progress" },
  { key: "files", label: "Sandbox" },
];

export function ContextPanel() {
  const tab = useAppStore((s) => s.contextTab);
  const setTab = useAppStore((s) => s.setContextTab);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-cj-border px-4 py-4">
        <div className="text-base font-semibold tracking-tight text-slate-950">Agent State</div>
        <div className="mt-0.5 text-xs text-cj-dim">Plans, tool calls, and workspace files</div>
      </div>
      <div className="flex items-center gap-1 border-b border-cj-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === t.key ? "bg-blue-50 text-cj-accent" : "text-cj-dim hover:bg-cj-panel2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "todos" ? <TodoPanel /> : null}
        {tab === "files" ? <FilesPanel /> : null}
      </div>
    </div>
  );
}
