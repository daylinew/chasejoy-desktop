import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { MemoryRow } from "@shared/domain.js";

export function MemoryPanel() {
  const memories = useAppStore((s) => s.memories);
  const refreshMemory = useAppStore((s) => s.refreshMemory);
  const [q, setQ] = useState("");

  useEffect(() => {
    void refreshMemory();
  }, [refreshMemory]);

  async function search() {
    await refreshMemory(q || undefined);
  }

  async function togglePin(m: MemoryRow) {
    await window.chasejoy.api.memoryPin(m.id, !m.pinned);
    await refreshMemory(q || undefined);
  }

  async function forget(m: MemoryRow) {
    await window.chasejoy.api.memoryForget(m.id);
    await refreshMemory(q || undefined);
  }

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search memory…"
          className="input flex-1 px-2 py-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
        />
        <button onClick={() => void search()} className="btn-ghost px-2 py-1 text-xs">
          Find
        </button>
      </div>
      {memories.length === 0 ? (
        <div className="rounded border border-dashed border-cj-border px-3 py-4 text-xs text-cj-dim">
          No memories yet. The extractor distills them after every {`{N}`} messages.
        </div>
      ) : (
        <ul className="space-y-2">
          {memories.map((m) => (
            <li key={m.id} className="rounded border border-cj-border bg-cj-panel2 p-2 text-xs">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase text-cj-dim">
                <span className="chip">{m.kind}</span>
                {m.pinned ? <span className="chip text-cj-accent">pinned</span> : null}
                {m.crossAgent ? <span className="chip text-cj-accent2">global</span> : null}
                <span className="ml-auto">imp {m.importance.toFixed(2)}</span>
              </div>
              <div className="text-sm text-slate-100">{m.content}</div>
              <div className="mt-1 flex gap-2 text-[11px]">
                <button onClick={() => void togglePin(m)} className="text-cj-accent hover:underline">
                  {m.pinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => void forget(m)} className="text-cj-err hover:underline">
                  Forget
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
