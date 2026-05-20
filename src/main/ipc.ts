import { ipcMain, type BrowserWindow } from "electron";

import {
  Channels,
  type ApiSurface,
} from "@shared/ipc-types.js";
import type { ApprovalDecision, StreamEvent } from "@shared/domain.js";

import { AgentRegistry } from "./agent/agent-registry.js";
import { StreamBridge } from "./agent/stream-bridge.js";
import { fetchModels } from "./agent/provider-probe.js";
import { getAgentCheckpointer } from "./agent/checkpointer.js";
import { getSettingsStore } from "./stores/settings-store.js";
import { AgentRepository } from "./db/repositories/agents.js";
import { ThreadRepository } from "./db/repositories/threads.js";
import { MessageRepository } from "./db/repositories/messages.js";
import { MilestoneRepository } from "./db/repositories/milestones.js";
import { AlignmentRepository } from "./db/repositories/alignment.js";

/**
 * Wires all IPC handlers, returns a teardown function.
 * The provided BrowserWindow is used to emit streaming events back to the renderer.
 */
export function registerIpc(win: BrowserWindow): () => void {
  const emitStream = (event: StreamEvent) => {
    if (!win.isDestroyed()) win.webContents.send(Channels.evtStream, event);
  };
  const emitApproval = (req: import("@shared/domain.js").ApprovalRequest) => {
    if (!win.isDestroyed()) win.webContents.send(Channels.evtApproval, req);
  };

  const registry = new AgentRegistry(
    (req) => emitApproval(req),
    (kind, payload) => {
      if (kind === "milestone_update") {
        emitStream({
          type: "milestone_update",
          milestone: payload as never,
          agentId: (payload as { agentId: string }).agentId,
          threadId: "",
        });
      }
    },
  );
  const bridge = new StreamBridge(registry, emitStream);

  const settingsStore = getSettingsStore();
  const agentRepo = new AgentRepository();
  const threadRepo = new ThreadRepository();
  const messageRepo = new MessageRepository();
  const milestoneRepo = new MilestoneRepository();
  const alignmentRepo = new AlignmentRepository();

  const handlers: { [K in keyof ApiSurface]: (...args: never[]) => unknown } = {
    /* Agents */
    agentList: () => registry.list(),
    agentCreate: (input: never) => registry.create(input as never),
    agentUpdate: (id: never, patch: never) => registry.update(id as never, patch as never),
    agentArchive: (id: never) => {
      registry.archive(id as never);
    },
    agentDelete: async (id: never) => {
      const agentId = id as unknown as string;
      const threads = threadRepo.listByAgent(agentId);
      registry.delete(agentId);
      await Promise.all(threads.map((t) => getAgentCheckpointer().deleteThread(t.id)));
    },

    /* Threads */
    threadList: (agentId: never) => threadRepo.listByAgent(agentId as never),
    threadCreate: (agentId: never, title?: never) =>
      threadRepo.create(agentId as never, title as never),
    threadRename: (id: never, title: never) => {
      threadRepo.rename(id as never, title as never);
    },
    threadDelete: async (id: never) => {
      const threadId = id as unknown as string;
      threadRepo.delete(threadId);
      await getAgentCheckpointer().deleteThread(threadId);
    },
    threadMessages: (threadId: never, limit?: never) =>
      messageRepo.listByThread(threadId as never, (limit as unknown as number) ?? 1000),

    /* Chat */
    chatStream: (input: never) => {
      const i = input as unknown as { threadId: string; content: string };
      const requestId = `${i.threadId}-${Date.now()}`;
      void bridge.run(i).catch((err) => {
        emitStream({
          type: "error",
          agentId: "",
          threadId: i.threadId,
          message: (err as Error).message,
        });
      });
      return { requestId };
    },
    chatCancel: (threadId: never) => {
      bridge.cancel(threadId as never);
    },

    /* Milestones */
    milestoneList: (agentId: never) => milestoneRepo.listByAgent(agentId as never),
    milestoneCreate: (input: never) => milestoneRepo.create(input as never),
    milestoneUpdate: (id: never, patch: never) => milestoneRepo.update(id as never, patch as never),
    milestoneDelete: (id: never) => {
      milestoneRepo.delete(id as never);
    },

    /* Alignment */
    alignmentLatest: (input: never) => {
      const i = input as unknown as { agentId: string; threadId?: string };
      return alignmentRepo.latest(i.agentId, i.threadId);
    },
    alignmentRealign: async (input: never) => {
      const i = input as unknown as { agentId: string; threadId: string };
      await bridge.realign(i.agentId, i.threadId);
    },

    /* Approval */
    approvalRespond: (input: never) => {
      const i = input as unknown as { requestId: string; decision: ApprovalDecision };
      registry.approval.respond(i.requestId, i.decision);
    },

    /* Settings */
    settingsGet: () => settingsStore.getMeta(),
    settingsSetMeta: (patch: never) => settingsStore.setMeta(patch as never),
    settingsListProviders: () => settingsStore.listProviders(false),
    settingsUpsertProvider: (input: never) => settingsStore.upsertProvider(input as never),
    settingsRemoveProvider: (id: never) => {
      settingsStore.removeProvider(id as never);
    },
    settingsSetDefaultProvider: (id: never) => {
      settingsStore.setDefaultProvider(id as never);
    },
    settingsFetchModels: (draft: never) => {
      const d = draft as unknown as {
        kind: import("@shared/domain.js").ProviderKind;
        baseURL?: string;
        apiKey?: string;
        providerId?: string;
      };
      const apiKey = d.apiKey || (d.providerId ? settingsStore.getApiKey(d.providerId) : null);
      if (!apiKey) throw new Error("API key is required to fetch models.");
      return fetchModels({ kind: d.kind, baseURL: d.baseURL, apiKey });
    },
    settingsSetTavilyKey: (key: never) => {
      settingsStore.setTavilyKey(key as never);
    },
  };

  type ChannelKey = keyof typeof Channels;
  type ApiKey = keyof ApiSurface;

  const channelByApi: Record<ApiKey, string> = {
    agentList: Channels.agentList,
    agentCreate: Channels.agentCreate,
    agentUpdate: Channels.agentUpdate,
    agentArchive: Channels.agentArchive,
    agentDelete: Channels.agentDelete,
    threadList: Channels.threadList,
    threadCreate: Channels.threadCreate,
    threadRename: Channels.threadRename,
    threadDelete: Channels.threadDelete,
    threadMessages: Channels.threadMessages,
    chatStream: Channels.chatStream,
    chatCancel: Channels.chatCancel,
    milestoneList: Channels.milestoneList,
    milestoneCreate: Channels.milestoneCreate,
    milestoneUpdate: Channels.milestoneUpdate,
    milestoneDelete: Channels.milestoneDelete,
    alignmentLatest: Channels.alignmentLatest,
    alignmentRealign: Channels.alignmentRealign,
    approvalRespond: Channels.approvalRespond,
    settingsGet: Channels.settingsGet,
    settingsSetMeta: Channels.settingsSetMeta,
    settingsListProviders: Channels.settingsListProviders,
    settingsUpsertProvider: Channels.settingsUpsertProvider,
    settingsRemoveProvider: Channels.settingsRemoveProvider,
    settingsSetDefaultProvider: Channels.settingsSetDefaultProvider,
    settingsFetchModels: Channels.settingsFetchModels,
    settingsSetTavilyKey: Channels.settingsSetTavilyKey,
  };

  const registered: string[] = [];
  for (const apiKey of Object.keys(handlers) as ApiKey[]) {
    const channel = channelByApi[apiKey];
    const handler = handlers[apiKey];
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await (handler as (...a: unknown[]) => unknown)(...(args as never[]));
      } catch (err) {
        console.error(`[IPC ${channel}]`, err);
        throw err;
      }
    });
    registered.push(channel);
  }

  return () => {
    for (const channel of registered) ipcMain.removeHandler(channel);
  };

  /* satisfy unused type warning */
  function _u(_k: ChannelKey) {}
  void _u;
}
