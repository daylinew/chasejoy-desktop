import { useAppStore } from "@renderer/stores/appStore";
import { Modal } from "../agent/NewAgentWizard";

export function ApprovalModal() {
  const req = useAppStore((s) => s.pendingApproval);
  const respond = useAppStore((s) => s.respondApproval);
  const setApproval = useAppStore((s) => s.setApproval);

  if (!req) return null;

  return (
    <Modal title="Needs your approval" onClose={() => setApproval(null)} widthClass="max-w-lg">
      <div className="space-y-3">
        <div className="text-sm text-cj-dim">
          The assistant wants to make a change or run a command. Choose how much trust to give this action.
        </div>
        <div className="rounded-lg border border-cj-border bg-white px-3 py-2 text-sm shadow-sm">
          <div className="text-xs uppercase text-cj-dim">{friendlyTool(req.tool)}</div>
          <div className="mt-1 font-medium text-slate-900">{req.summary}</div>
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg border border-cj-border bg-slate-950 p-3 text-[11px] text-slate-100">
{req.argsJson}
        </pre>

        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <button onClick={() => void respond("deny")} className="rounded-md bg-cj-err/10 px-3 py-2 text-sm font-medium text-cj-err hover:bg-cj-err/15">
            Deny
          </button>
          <button onClick={() => void respond("allow_once")} className="btn-ghost">
            Allow once
          </button>
          <button onClick={() => void respond("allow_session")} className="btn-ghost">
            This chat
          </button>
          <button onClick={() => void respond("allow_agent")} className="btn-primary">
            Always allow
          </button>
        </div>
      </div>
    </Modal>
  );
}

function friendlyTool(tool: string): string {
  if (tool === "execute") return "Run command";
  if (tool === "write_file") return "Create file";
  if (tool === "edit_file") return "Edit file";
  return tool;
}
