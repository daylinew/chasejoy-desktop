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
      <div className="flex items-center justify-between border-b border-cj-border px-3 py-3">
        <div className="text-sm font-semibold tracking-wide text-slate-100">ChaseJoy</div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded px-2 py-1 text-xs text-cj-dim hover:bg-cj-panel2 hover:text-slate-100"
          title="Settings"
        >
          Settings
        </button>
      </div>

      <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wider text-cj-dim">
        <span>Agents</span>
        <button
          onClick={() => setNewAgentOpen(true)}
          className="rounded bg-cj-accent/20 px-2 py-0.5 text-cj-accent hover:bg-cj-accent/30"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        {agents.length === 0 ? (
          <div className="px-3 py-4 text-xs text-cj-dim">
            No agents yet. Click <span className="font-semibold">+ New</span> to create one.
          </div>
        ) : (
          agents.map((a) => {
            const isActive = a.id === activeAgentId;
            const agentThreads = isActive ? threads : [];
            return (
              <div key={a.id} className="mb-1">
                <button
                  onClick={() => void selectAgent(a.id)}
                  className={`group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                    isActive ? "bg-cj-accent/15 text-slate-100" : "text-slate-200 hover:bg-cj-panel2"
                  }`}
                  title={a.role ?? ""}
                >
                  <span className="truncate">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${isActive ? "bg-cj-accent" : "bg-cj-dim/60"}`} />
                    {a.name}
                  </span>
                </button>
                {isActive ? (
                  <div className="ml-3 mt-1 border-l border-cj-border pl-2">
                    <div className="flex items-center justify-between pr-1 text-[10px] uppercase tracking-wider text-cj-dim">
                      <span>Threads</span>
                      <button
                        onClick={() => void createThread()}
                        className="rounded px-1.5 py-0.5 text-cj-accent hover:bg-cj-accent/10"
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
                          className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${
                            t.id === activeThreadId
                              ? "bg-cj-panel2 text-slate-100"
                              : "text-slate-300 hover:bg-cj-panel2"
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
