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

  return (
    <div className="flex h-full w-full bg-cj-bg text-slate-900">
      <aside className="w-72 shrink-0 border-r border-cj-border bg-white">
        <AgentSidebar />
      </aside>

      <main className="flex flex-1 min-w-0 flex-col">
        <ProjectNavBar />
        <div className="flex-1 min-h-0">
          <ChatView />
        </div>
      </main>

      {settingsOpen ? <SettingsView /> : null}
      {newAgentOpen ? <NewAgentWizard /> : null}
      {goalEditorOpen ? <GoalEditor /> : null}
      {pendingApproval ? <ApprovalModal /> : null}
    </div>
  );
}
