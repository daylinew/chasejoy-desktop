import { create } from "zustand";

import type {
  AgentRow,
  AlignmentEvent,
  ApprovalRequest,
  MemoryRow,
  MessageRow,
  MilestoneRow,
  ProviderProfile,
  ThreadRow,
  StreamEvent,
} from "@shared/domain.js";

type TodoItem = { content: string; status: "pending" | "in_progress" | "completed" };

interface AssistantBubble {
  id: string;
  content: string;
  /** True while the assistant is still streaming into this bubble. */
  streaming: boolean;
}

export interface AppState {
  /* Settings */
  profiles: ProviderProfile[];
  loadingProfiles: boolean;

  /* Agents */
  agents: AgentRow[];
  activeAgentId: string | null;
  loadingAgents: boolean;

  /* Threads */
  threads: ThreadRow[];
  activeThreadId: string | null;
  loadingThreads: boolean;

  /* Conversation */
  messages: MessageRow[];
  streamingBubble: AssistantBubble | null;
  composerBusy: boolean;

  /* Project nav */
  milestones: MilestoneRow[];
  alignment: AlignmentEvent | null;

  /* Context panels */
  todos: TodoItem[];
  files: Record<string, string>;
  toolEvents: { id: string; toolName: string; argsJson: string; resultPreview?: string }[];
  memories: MemoryRow[];

  /* Approval */
  pendingApproval: ApprovalRequest | null;

  /* UI */
  contextTab: "todos" | "files" | "memory";
  settingsOpen: boolean;
  newAgentOpen: boolean;
  goalEditorOpen: boolean;

  /* Mutators */
  refreshProfiles: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  selectAgent: (id: string | null) => Promise<void>;
  selectThread: (id: string) => Promise<void>;
  createThread: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  cancelStream: () => Promise<void>;
  refreshMilestones: () => Promise<void>;
  refreshMemory: (query?: string) => Promise<void>;
  realign: () => Promise<void>;
  respondApproval: (decision: import("@shared/domain.js").ApprovalDecision) => Promise<void>;
  setContextTab: (tab: AppState["contextTab"]) => void;
  setSettingsOpen: (open: boolean) => void;
  setNewAgentOpen: (open: boolean) => void;
  setGoalEditorOpen: (open: boolean) => void;
  applyStreamEvent: (evt: StreamEvent) => void;
  setApproval: (req: ApprovalRequest | null) => void;
}

const api = () => window.chasejoy.api;

export const useAppStore = create<AppState>((set, get) => ({
  profiles: [],
  loadingProfiles: false,
  agents: [],
  activeAgentId: null,
  loadingAgents: false,
  threads: [],
  activeThreadId: null,
  loadingThreads: false,
  messages: [],
  streamingBubble: null,
  composerBusy: false,
  milestones: [],
  alignment: null,
  todos: [],
  files: {},
  toolEvents: [],
  memories: [],
  pendingApproval: null,
  contextTab: "todos",
  settingsOpen: false,
  newAgentOpen: false,
  goalEditorOpen: false,

  async refreshProfiles() {
    set({ loadingProfiles: true });
    try {
      const profiles = await api().settingsListProfiles();
      set({ profiles, loadingProfiles: false });
    } catch (err) {
      console.error(err);
      set({ loadingProfiles: false });
    }
  },

  async refreshAgents() {
    set({ loadingAgents: true });
    try {
      const agents = await api().agentList();
      set({ agents, loadingAgents: false });
      const active = get().activeAgentId;
      if (active && !agents.find((a) => a.id === active)) set({ activeAgentId: null });
      if (!get().activeAgentId && agents.length > 0) await get().selectAgent(agents[0]!.id);
    } catch (err) {
      console.error(err);
      set({ loadingAgents: false });
    }
  },

  async selectAgent(id) {
    set({ activeAgentId: id, activeThreadId: null, messages: [], streamingBubble: null });
    if (!id) {
      set({ threads: [], milestones: [], alignment: null, memories: [], todos: [], files: {}, toolEvents: [] });
      return;
    }
    set({ loadingThreads: true });
    try {
      const [threads, milestones, alignment, memories] = await Promise.all([
        api().threadList(id),
        api().milestoneList(id),
        api().alignmentLatest({ agentId: id }),
        api().memoryListRecent({ agentId: id, limit: 20 }),
      ]);
      set({ threads, milestones, alignment, memories, loadingThreads: false, todos: [], files: {}, toolEvents: [] });
      if (threads.length > 0) await get().selectThread(threads[0]!.id);
    } catch (err) {
      console.error(err);
      set({ loadingThreads: false });
    }
  },

  async selectThread(id) {
    set({ activeThreadId: id, messages: [], streamingBubble: null, todos: [], files: {}, toolEvents: [] });
    try {
      const messages = await api().threadMessages(id);
      set({ messages });
      const agentId = get().activeAgentId;
      if (agentId) {
        const alignment = await api().alignmentLatest({ agentId, threadId: id });
        set({ alignment });
      }
    } catch (err) {
      console.error(err);
    }
  },

  async createThread() {
    const agentId = get().activeAgentId;
    if (!agentId) return;
    const t = await api().threadCreate(agentId);
    set({ threads: [t, ...get().threads] });
    await get().selectThread(t.id);
  },

  async sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    let threadId = get().activeThreadId;
    if (!threadId) {
      const agentId = get().activeAgentId;
      if (!agentId) return;
      const t = await api().threadCreate(agentId, trimmed.slice(0, 40));
      threadId = t.id;
      set({ threads: [t, ...get().threads], activeThreadId: t.id });
    }

    /* optimistic user message */
    const optimistic: MessageRow = {
      id: `tmp-${Date.now()}`,
      threadId,
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    set({
      messages: [...get().messages, optimistic],
      composerBusy: true,
      streamingBubble: { id: `assistant-${Date.now()}`, content: "", streaming: true },
    });

    try {
      await api().chatStream({ threadId, content: trimmed });
    } catch (err) {
      console.error(err);
      set({ composerBusy: false, streamingBubble: null });
    }
  },

  async cancelStream() {
    const tid = get().activeThreadId;
    if (!tid) return;
    try {
      await api().chatCancel(tid);
    } catch (err) {
      console.error(err);
    }
  },

  async refreshMilestones() {
    const id = get().activeAgentId;
    if (!id) return;
    const milestones = await api().milestoneList(id);
    set({ milestones });
  },

  async refreshMemory(query) {
    const id = get().activeAgentId;
    if (!id) return;
    const memories = query
      ? await api().memorySearch({ agentId: id, query, limit: 30 })
      : await api().memoryListRecent({ agentId: id, limit: 30 });
    set({ memories });
  },

  async realign() {
    const agentId = get().activeAgentId;
    const threadId = get().activeThreadId;
    if (!agentId || !threadId) return;
    await api().alignmentRealign({ agentId, threadId });
  },

  async respondApproval(decision) {
    const req = get().pendingApproval;
    if (!req) return;
    await api().approvalRespond({ requestId: req.id, decision });
    set({ pendingApproval: null });
  },

  setContextTab(tab) {
    set({ contextTab: tab });
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },
  setNewAgentOpen(open) {
    set({ newAgentOpen: open });
  },
  setGoalEditorOpen(open) {
    set({ goalEditorOpen: open });
  },

  applyStreamEvent(evt) {
    switch (evt.type) {
      case "message_delta": {
        const bubble = get().streamingBubble;
        if (!bubble) return;
        set({
          streamingBubble: {
            ...bubble,
            content: bubble.content + evt.deltaContent,
          },
        });
        break;
      }
      case "message_complete": {
        const bubble = get().streamingBubble;
        const newMessage: MessageRow = {
          id: evt.messageId,
          threadId: evt.threadId,
          role: evt.role,
          content: evt.content,
          createdAt: Date.now(),
        };
        set({
          messages: [...get().messages, newMessage],
          streamingBubble: bubble ? { ...bubble, streaming: false } : null,
        });
        break;
      }
      case "tool_call": {
        set({
          toolEvents: [
            ...get().toolEvents.slice(-49),
            { id: evt.toolCallId, toolName: evt.toolName, argsJson: evt.argsJson },
          ],
        });
        break;
      }
      case "tool_result": {
        set({
          toolEvents: get().toolEvents.map((t) =>
            t.id === evt.toolCallId ? { ...t, resultPreview: evt.resultPreview } : t,
          ),
        });
        break;
      }
      case "todos":
        set({ todos: evt.todos });
        break;
      case "files":
        set({ files: { ...get().files, ...evt.files } });
        break;
      case "milestone_update": {
        const cur = get().milestones;
        const idx = cur.findIndex((m) => m.id === evt.milestone.id);
        const next = idx >= 0 ? cur.map((m, i) => (i === idx ? evt.milestone : m)) : [...cur, evt.milestone];
        set({ milestones: next });
        break;
      }
      case "alignment":
        set({
          alignment: {
            id: 0,
            agentId: evt.agentId,
            threadId: evt.threadId,
            score: evt.score,
            reasoning: evt.reasoning,
            createdAt: Date.now(),
          },
        });
        break;
      case "approval_request":
        set({ pendingApproval: evt.request });
        break;
      case "error":
        console.error("[Agent error]", evt.message);
        set({ composerBusy: false, streamingBubble: null });
        break;
      case "done":
        set({ composerBusy: false, streamingBubble: null });
        void get().refreshMemory();
        break;
    }
  },

  setApproval(req) {
    set({ pendingApproval: req });
  },
}));
