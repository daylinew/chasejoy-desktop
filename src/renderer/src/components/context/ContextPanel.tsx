import { useAppStore } from "@renderer/stores/appStore";

import { TodoPanel } from "./TodoPanel";
import { FilesPanel } from "./FilesPanel";
import { MemoryPanel } from "./MemoryPanel";

const TABS: { key: "todos" | "files" | "memory"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "files", label: "Files" },
  { key: "memory", label: "Memory" },
];

export function ContextPanel() {
  const tab = useAppStore((s) => s.contextTab);
  const setTab = useAppStore((s) => s.setContextTab);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-cj-border px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded px-3 py-1 text-xs ${
              tab === t.key ? "bg-cj-accent/20 text-cj-accent" : "text-cj-dim hover:bg-cj-panel2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "todos" ? <TodoPanel /> : null}
        {tab === "files" ? <FilesPanel /> : null}
        {tab === "memory" ? <MemoryPanel /> : null}
      </div>
    </div>
  );
}
