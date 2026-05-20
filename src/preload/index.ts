import { contextBridge, ipcRenderer } from "electron";

import { Channels } from "@shared/ipc-types.js";
import type { ApiSurface } from "@shared/ipc-types.js";
import type { ApprovalRequest, StreamEvent } from "@shared/domain.js";

function rpc<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api: ApiSurface = {
  /* Agents */
  agentList: () => rpc(Channels.agentList),
  agentCreate: (input) => rpc(Channels.agentCreate, input),
  agentUpdate: (id, patch) => rpc(Channels.agentUpdate, id, patch),
  agentArchive: (id) => rpc(Channels.agentArchive, id),
  agentDelete: (id) => rpc(Channels.agentDelete, id),

  /* Threads */
  threadList: (agentId) => rpc(Channels.threadList, agentId),
  threadCreate: (agentId, title) => rpc(Channels.threadCreate, agentId, title),
  threadRename: (id, title) => rpc(Channels.threadRename, id, title),
  threadDelete: (id) => rpc(Channels.threadDelete, id),
  threadMessages: (threadId, limit) => rpc(Channels.threadMessages, threadId, limit),

  /* Chat */
  chatStream: (input) => rpc(Channels.chatStream, input),
  chatCancel: (threadId) => rpc(Channels.chatCancel, threadId),

  /* Memory */
  memorySearch: (input) => rpc(Channels.memorySearch, input),
  memoryListRecent: (input) => rpc(Channels.memoryListRecent, input),
  memorySave: (input) => rpc(Channels.memorySave, input),
  memoryPin: (id, pinned) => rpc(Channels.memoryPin, id, pinned),
  memoryForget: (id) => rpc(Channels.memoryForget, id),

  /* Milestones */
  milestoneList: (agentId) => rpc(Channels.milestoneList, agentId),
  milestoneCreate: (input) => rpc(Channels.milestoneCreate, input),
  milestoneUpdate: (id, patch) => rpc(Channels.milestoneUpdate, id, patch),
  milestoneDelete: (id) => rpc(Channels.milestoneDelete, id),

  /* Alignment */
  alignmentLatest: (input) => rpc(Channels.alignmentLatest, input),
  alignmentRealign: (input) => rpc(Channels.alignmentRealign, input),

  /* Approval */
  approvalRespond: (input) => rpc(Channels.approvalRespond, input),

  /* Settings */
  settingsGet: () => rpc(Channels.settingsGet),
  settingsSetMeta: (patch) => rpc(Channels.settingsSetMeta, patch),
  settingsListProfiles: () => rpc(Channels.settingsListProfiles),
  settingsUpsertProfile: (input) => rpc(Channels.settingsUpsertProfile, input),
  settingsRemoveProfile: (id) => rpc(Channels.settingsRemoveProfile, id),
  settingsSetDefaultProfile: (id) => rpc(Channels.settingsSetDefaultProfile, id),
  settingsSetTavilyKey: (key) => rpc(Channels.settingsSetTavilyKey, key),
};

const on = {
  onStream(handler: (evt: StreamEvent) => void): () => void {
    const listener = (_e: unknown, evt: StreamEvent) => handler(evt);
    ipcRenderer.on(Channels.evtStream, listener);
    return () => ipcRenderer.off(Channels.evtStream, listener);
  },
  onApprovalRequest(handler: (req: ApprovalRequest) => void): () => void {
    const listener = (_e: unknown, req: ApprovalRequest) => handler(req);
    ipcRenderer.on(Channels.evtApproval, listener);
    return () => ipcRenderer.off(Channels.evtApproval, listener);
  },
};

contextBridge.exposeInMainWorld("chasejoy", {
  api,
  on,
  version: "0.1.0",
});
