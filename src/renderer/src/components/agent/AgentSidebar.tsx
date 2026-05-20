import { useAppStore } from "@renderer/stores/appStore";

export function AgentSidebar() {
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const threads = useAppStore((s) => s.threads);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const selectThread = useAppStore((s) => s.selectThread);
  const createThread = useAppStore((s) => s.createThread);
  const setNewAgentOpen = useAppStore((s) => s.setNewAgentOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-cj-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold tracking-tight text-slate-950">ChaseJoy</div>
            <div className="mt-0.5 text-xs text-cj-dim">Base Agent workbench</div>
          </div>
        <button
          onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-cj-border bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm hover:bg-cj-panel2"
          title="Settings"
        >
          Settings
        </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <span className="section-label">Agents</span>
        <button
          onClick={() => setNewAgentOpen(true)}
          className="rounded-md bg-cj-accent px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
        >
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
            No agents yet. Create a base agent to start building your workspace.
          </div>
        ) : (
          agents.map((a) => {
            const isActive = a.id === activeAgentId;
            const agentThreads = isActive ? threads : [];
            return (
              <div key={a.id} className="mb-1">
                <button
                  onClick={() => void selectAgent(a.id)}
                  className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    isActive ? "bg-blue-50 text-cj-accent ring-1 ring-blue-100" : "text-slate-700 hover:bg-cj-panel2"
                  }`}
                  title={a.role ?? ""}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-cj-dim">{a.role || "Base agent"}</span>
                  </span>
                </button>
                {isActive ? (
                  <div className="ml-3 mt-2 border-l border-cj-border pl-3">
                    <div className="mb-1 flex items-center justify-between pr-1 section-label">
                      <span>Threads</span>
                      <button
                        onClick={() => void createThread()}
                        className="rounded px-1.5 py-0.5 text-cj-accent hover:bg-blue-50"
                      >
                        +
                      </button>
                    </div>
                    {agentThreads.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-cj-dim">No conversations yet.</div>
                    ) : (
                      agentThreads.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => void selectThread(t.id)}
                          className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                            t.id === activeThreadId
                              ? "bg-cj-panel2 text-slate-900"
                              : "text-slate-600 hover:bg-cj-panel2"
                          }`}
                        >
                          {t.title || "Untitled"}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
