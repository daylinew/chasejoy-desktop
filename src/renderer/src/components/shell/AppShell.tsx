import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";

import { AgentSidebar } from "../agent/AgentSidebar";
import { ProjectNavBar } from "../project/ProjectNavBar";
import { ChatView } from "../chat/ChatView";
import { NewAgentWizard } from "../agent/NewAgentWizard";
import { SettingsView } from "../settings/SettingsView";
import { GoalEditor } from "../project/GoalEditor";
import { ApprovalModal } from "../chat/ApprovalModal";

export function AppShell() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const newAgentOpen = useAppStore((s) => s.newAgentOpen);
  const goalEditorOpen = useAppStore((s) => s.goalEditorOpen);
  const pendingApproval = useAppStore((s) => s.pendingApproval);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full w-full overflow-hidden bg-zinc-50 text-slate-950">
      <aside className="w-[clamp(224px,21vw,270px)] shrink-0 border-r border-zinc-200/80 bg-[#f7f7f4] max-[760px]:hidden">
        <AgentSidebar />
      </aside>
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed left-3 top-3 z-30 hidden h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 max-[760px]:flex"
        title="打开侧栏"
      >
        ☰
      </button>

      <main className="flex min-w-0 flex-1 flex-col">
        <ProjectNavBar />
        <div className="min-h-0 flex-1">
          <ChatView />
        </div>
      </main>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 hidden bg-slate-950/10 max-[760px]:block" onClick={() => setSidebarOpen(false)}>
          <aside
            className="h-full w-[min(82vw,280px)] border-r border-zinc-200 bg-[#f7f7f4] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <AgentSidebar />
          </aside>
        </div>
      ) : null}

      {settingsOpen ? <SettingsView /> : null}
      {newAgentOpen ? <NewAgentWizard /> : null}
      {goalEditorOpen ? <GoalEditor /> : null}
      {pendingApproval ? <ApprovalModal /> : null}
    </div>
  );
}
