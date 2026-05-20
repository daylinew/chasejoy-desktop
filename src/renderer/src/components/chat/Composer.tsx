import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";

export function Composer({ disabled }: { disabled?: boolean }) {
  const [text, setText] = useState("");
  const busy = useAppStore((s) => s.composerBusy);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const cancelStream = useAppStore((s) => s.cancelStream);

  async function submit() {
    if (busy || !text.trim()) return;
    const next = text;
    setText("");
    await sendMessage(next);
  }

  return (
    <div className="mx-auto flex max-w-5xl items-end gap-3 rounded-2xl border border-cj-border bg-white p-2 shadow-panel">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={disabled ? "Select an agent first…" : "Message the agent… (Enter to send, Shift+Enter for newline)"}
        rows={3}
        disabled={disabled || busy}
        className="min-h-[72px] flex-1 resize-none rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder:text-cj-dim focus:outline-none focus:ring-0"
      />
      {busy ? (
        <button onClick={() => void cancelStream()} className="btn-ghost h-10">
          Stop
        </button>
      ) : (
        <button onClick={() => void submit()} disabled={!text.trim()} className="btn-primary h-10">
          Send
        </button>
      )}
    </div>
  );
}
