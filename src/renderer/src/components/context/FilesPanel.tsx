import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";

export function FilesPanel() {
  const files = useAppStore((s) => s.files);
  const [selected, setSelected] = useState<string | null>(null);

  const keys = Object.keys(files).sort();

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <section className="min-h-0">
        <div className="mb-2 section-label">Files</div>
        {keys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
            Files the assistant creates or edits will appear here.
          </div>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-cj-border bg-white p-1 shadow-sm">
            {keys.map((k) => (
              <li key={k}>
                <button
                  onClick={() => setSelected(k)}
                  className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                    selected === k ? "bg-blue-50 text-cj-accent" : "text-slate-700 hover:bg-cj-panel2"
                  }`}
                  title={k}
                >
                  {k}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 section-label">Preview</div>
        {selected ? (
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-cj-border bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100 shadow-sm">
{files[selected]}
          </pre>
        ) : (
          <div className="flex min-h-28 items-center rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
            Select a file to preview.
          </div>
        )}
      </section>
    </div>
  );
}
