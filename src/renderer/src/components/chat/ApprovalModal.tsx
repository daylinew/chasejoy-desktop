import { useAppStore } from "@renderer/stores/appStore";
import { Modal } from "../agent/NewAgentWizard";

export function ApprovalModal() {
  const req = useAppStore((s) => s.pendingApproval);
  const respond = useAppStore((s) => s.respondApproval);
  const setApproval = useAppStore((s) => s.setApproval);

  if (!req) return null;

  return (
    <Modal title="Confirm agent action" onClose={() => setApproval(null)} widthClass="max-w-lg">
      <div className="space-y-3">
        <div className="text-sm text-cj-dim">The agent is about to run a privileged tool. Approve to continue.</div>
        <div className="rounded border border-cj-border bg-cj-panel2 px-3 py-2 text-sm">
          <div className="text-xs uppercase text-cj-dim">{req.tool}</div>
          <div className="mt-1 font-medium text-slate-100">{req.summary}</div>
        </div>
        <pre className="max-h-48 overflow-auto rounded border border-cj-border bg-cj-bg p-2 text-[11px] text-cj-dim">
{req.argsJson}
        </pre>

        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <button onClick={() => void respond("deny")} className="rounded bg-cj-err/20 px-3 py-2 text-sm text-cj-err hover:bg-cj-err/30">
            Deny
          </button>
          <button onClick={() => void respond("allow_once")} className="btn-ghost">
            Allow once
          </button>
          <button onClick={() => void respond("allow_session")} className="btn-ghost">
            Allow this session
          </button>
          <button onClick={() => void respond("allow_agent")} className="btn-primary">
            Trust for this agent
          </button>
        </div>
      </div>
    </Modal>
  );
}
