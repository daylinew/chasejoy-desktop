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
    <div className="mx-auto flex max-w-3xl items-end gap-2">
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
        className="input flex-1 resize-none"
      />
      {busy ? (
        <button onClick={() => void cancelStream()} className="btn-ghost h-[42px]">
          Stop
        </button>
      ) : (
        <button onClick={() => void submit()} disabled={!text.trim()} className="btn-primary h-[42px]">
          Send
        </button>
      )}
    </div>
  );
}
