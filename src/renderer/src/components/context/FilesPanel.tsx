import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";

export function FilesPanel() {
  const files = useAppStore((s) => s.files);
  const [selected, setSelected] = useState<string | null>(null);

  const keys = Object.keys(files).sort();

  return (
    <div className="flex h-full">
      <div className="w-1/2 overflow-y-auto border-r border-cj-border p-2">
        <div className="mb-2 text-xs uppercase tracking-wider text-cj-dim">Virtual filesystem</div>
        {keys.length === 0 ? (
          <div className="rounded border border-dashed border-cj-border px-3 py-4 text-xs text-cj-dim">
            No files yet.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {keys.map((k) => (
              <li key={k}>
                <button
                  onClick={() => setSelected(k)}
                  className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${
                    selected === k ? "bg-cj-accent/20 text-cj-accent" : "hover:bg-cj-panel2"
                  }`}
                  title={k}
                >
                  {k}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="w-1/2 overflow-y-auto p-2">
        {selected ? (
          <pre className="whitespace-pre-wrap break-words rounded border border-cj-border bg-cj-bg p-2 text-[11px] text-slate-200">
{files[selected]}
          </pre>
        ) : (
          <div className="px-2 py-4 text-xs text-cj-dim">Select a file to preview.</div>
        )}
      </div>
    </div>
  );
}
