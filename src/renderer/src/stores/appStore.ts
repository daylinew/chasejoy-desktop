import { create } from "zustand";

import type {
  AgentRow,
  AgentRunContext,
  AlignmentEvent,
  ApprovalRequest,
  MessageRow,
  MilestoneRow,
  Provider,
  RunToolEvent,
  ThreadRow,
  StreamEvent,
  SubagentStreamInterface,
} from "@shared/domain.js";

type TodoItem = { content: string; status: "pending" | "in_progress" | "completed" };

interface AssistantBubble {
  id: string;
  content: string;
  /** True while the assistant is still streaming into this bubble. */
  streaming: boolean;
  subagents?: SubagentStreamInterface[];
  toolEvents?: RunToolEvent[];
}

export interface AppState {
  /* Settings */
  providers: Provider[];
  loadingProviders: boolean;

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
  toolEvents: RunToolEvent[];
  /* Approval */
  pendingApproval: ApprovalRequest | null;

  /* UI */
  contextTab: "todos" | "files";
  settingsOpen: boolean;
  newAgentOpen: boolean;
  goalEditorOpen: boolean;

  /* Mutators */
  refreshProviders: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  selectAgent: (id: string | null) => Promise<void>;
  selectThread: (id: string) => Promise<void>;
  createThread: () => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  sendMessage: (text: string, opts?: AgentRunContext) => Promise<void>;
  cancelStream: () => Promise<void>;
  refreshMilestones: () => Promise<void>;
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
  providers: [],
  loadingProviders: false,
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
  pendingApproval: null,
  contextTab: "todos",
  settingsOpen: false,
  newAgentOpen: false,
  goalEditorOpen: false,

  async refreshProviders() {
    set({ loadingProviders: true });
    try {
      const providers = await api().settingsListProviders();
      set({ providers, loadingProviders: false });
    } catch (err) {
      console.error(err);
      set({ loadingProviders: false });
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
      set({ threads: [], milestones: [], alignment: null, todos: [], files: {}, toolEvents: [] });
      return;
    }
    set({ loadingThreads: true });
    try {
      const [threads, milestones, alignment] = await Promise.all([
        api().threadList(id),
        api().milestoneList(id),
        api().alignmentLatest({ agentId: id }),
      ]);
      set({ threads, milestones, alignment, loadingThreads: false, todos: [], files: {}, toolEvents: [] });
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
    set({ composerBusy: false, streamingBubble: null });
    const t = await api().threadCreate(agentId);
    set({ threads: [t, ...get().threads] });
    await get().selectThread(t.id);
  },

  async deleteThread(id) {
    await api().threadDelete(id);
    const remaining = get().threads.filter((t) => t.id !== id);
    set({ threads: remaining, composerBusy: false, streamingBubble: null });
    if (get().activeThreadId !== id) return;
    if (remaining.length > 0) {
      await get().selectThread(remaining[0]!.id);
    } else {
      set({
        activeThreadId: null,
        messages: [],
        streamingBubble: null,
        todos: [],
        files: {},
        toolEvents: [],
        alignment: null,
        composerBusy: false,
      });
    }
  },

  async sendMessage(text, opts) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const agentId = get().activeAgentId;
    const activeAgent = get().agents.find((a) => a.id === agentId) ?? null;
    const workspaceDir = opts?.workspaceDir?.trim() || activeAgent?.workspaceDir;
    const context: AgentRunContext = {
      workspaceDir,
      attachments: opts?.attachments?.slice(0, 12) ?? [],
    };

    if (workspaceDir && activeAgent && workspaceDir !== activeAgent.workspaceDir) {
      await api().agentUpdate(activeAgent.id, { workspaceDir });
      await get().refreshAgents();
    }

    let threadId = get().activeThreadId;
    if (!threadId) {
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
      todos: [],
      files: {},
      toolEvents: [],
      streamingBubble: { id: `assistant-${Date.now()}`, content: "", streaming: true },
    });

    try {
      await api().chatStream({ threadId, content: trimmed, context });
    } catch (err) {
      console.error(err);
      set({ composerBusy: false, streamingBubble: null });
    }
  },

  async cancelStream() {
    const tid = get().activeThreadId;
    if (!tid) return;
    set({ composerBusy: false, streamingBubble: null });
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
          toolCalls: evt.toolCalls ? JSON.stringify(evt.toolCalls) : null,
          subagents: evt.subagents ? JSON.stringify(evt.subagents) : null,
          createdAt: Date.now(),
        };
        set({
          messages: [...get().messages, newMessage],
          streamingBubble: bubble ? { ...bubble, streaming: false } : null,
        });
        break;
      }
      case "subagent_update": {
        const bubble = get().streamingBubble;
        if (bubble) {
          const subagents = bubble.subagents || [];
          const idx = subagents.findIndex((s) => s.id === evt.subagent.id);
          const next =
            idx >= 0
              ? subagents.map((s, i) => (i === idx ? evt.subagent : s))
              : [...subagents, evt.subagent];
          set({
            streamingBubble: {
              ...bubble,
              subagents: next,
            },
          });
        }
        break;
      }
      case "tool_call": {
        const bubble = get().streamingBubble;
        const nextEvent = { id: evt.toolCallId, toolName: evt.toolName, argsJson: evt.argsJson };
        set({
          toolEvents: [
            ...get().toolEvents.slice(-49),
            nextEvent,
          ],
          streamingBubble: bubble
            ? { ...bubble, toolEvents: [...(bubble.toolEvents ?? []), nextEvent] }
            : bubble,
        });
        break;
      }
      case "tool_result": {
        const bubble = get().streamingBubble;
        set({
          toolEvents: get().toolEvents.map((t) =>
            t.id === evt.toolCallId ? { ...t, resultPreview: evt.resultPreview } : t,
          ),
          streamingBubble: bubble
            ? {
                ...bubble,
                toolEvents: (bubble.toolEvents ?? []).map((t) =>
                  t.id === evt.toolCallId ? { ...t, resultPreview: evt.resultPreview } : t,
                ),
              }
            : bubble,
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
        set({
          composerBusy: false,
          streamingBubble: null,
          messages: [
            ...get().messages,
            {
              id: `err-${Date.now()}`,
              threadId: evt.threadId,
              role: "assistant",
              content: `运行出错：${evt.message}`,
              createdAt: Date.now(),
            },
          ],
        });
        break;
      case "done": {
        const bubble = get().streamingBubble;
        if (bubble?.streaming) {
          const hasVisibleWork =
            bubble.content.trim().length > 0 ||
            (bubble.toolEvents?.length ?? 0) > 0 ||
            (bubble.subagents?.length ?? 0) > 0;
          const fallbackMessage: MessageRow = {
            id: bubble.id,
            threadId: evt.threadId,
            role: "assistant",
            content: hasVisibleWork ? bubble.content : "未收到模型输出。",
            toolCalls: bubble.toolEvents ? JSON.stringify(bubble.toolEvents) : null,
            subagents: bubble.subagents ? JSON.stringify(bubble.subagents) : null,
            createdAt: Date.now(),
          };
          set({
            composerBusy: false,
            streamingBubble: null,
            messages: [...get().messages, fallbackMessage],
          });
        } else {
          set({ composerBusy: false, streamingBubble: null });
        }
        break;
      }
    }
  },

  setApproval(req) {
    set({ pendingApproval: req });
  },
}));
