import type { AlignmentEvent } from "@shared/domain.js";

export function AlignmentBadge({ alignment }: { alignment: AlignmentEvent | null }) {
  if (!alignment) {
    return (
      <span className="chip flex items-center gap-1.5" title="No alignment evaluation yet.">
        <span className="h-2 w-2 rounded-full bg-cj-dim" />
        not checked
      </span>
    );
  }
  const map = {
    green: { color: "bg-cj-ok", label: "on track" },
    yellow: { color: "bg-cj-warn", label: "review" },
    red: { color: "bg-cj-err", label: "off track" },
  } as const;
  const m = map[alignment.score];
  return (
    <span
      className="chip flex items-center gap-1.5"
      title={alignment.reasoning || "Alignment evaluator did not provide a reason."}
    >
      <span className={`h-2 w-2 rounded-full ${m.color}`} />
      {m.label}
    </span>
  );
}
