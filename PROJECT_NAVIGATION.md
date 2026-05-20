# ChaseJoy Desktop Project Navigation

Last updated: 2026-05-20

## North Star

ChaseJoy is a desktop Base Agent platform. It should let users build and run their own personal agent system through natural language, local context, reusable assets, visible execution, approvals, and artifacts.

It is not a fixed vertical app and not a simple chatbot. Product scenarios such as coding review, test generation, Feishu assistant, or document creation should be buildable assets on top of the platform.

Core rule: use DeepAgents, LangChain, and LangGraph SDK capabilities first. Only write custom code for product-specific behavior the SDK does not cover.

## Product Model

```text
Agent       = autonomous planning and execution
Workflow    = controlled repeatable execution
Skill       = reusable method, standard, or instruction
Tool        = concrete capability
Memory      = durable context
Integration = external system bridge
Protocol    = MCP/ACP extension surface
Run         = execution record with timeline, approvals, artifacts, and result
```

Persistent assets can be drafted by agents, but saving or mutating them should go through user confirmation.

## UX Direction

The default interaction should feel closer to Codex/opencode than to a dashboard:

- Main surface: conversation plus inline execution cards.
- Left sidebar: agents and conversations.
- No default right-side technical state panel.
- During a run, the assistant message shows visible work: `Working`, `Reading`, `Editing`, `Running`, `Delegating`, `Waiting for approval`.
- After a run, the assistant message should keep a summary card: edited files, commands/checks, review/open artifact actions.
- Approvals should be focused choices: deny, allow once, allow this chat, always allow.
- Do not expose internal words in primary UI: IPC, stream events, tool calls, sandbox, unknown.

Terminology:

- Use `Conversations`, not `Threads`.
- Use `Files` or `Workspace files`, not `Sandbox`.
- Use `Goal progress` / `Goal steps`, not raw `Milestones` in primary UI.
- Use `Re-plan`, not `Realign`.
- Hide alignment state when no check has happened.

## Architecture

- Renderer UI: chat, execution cards, asset cards, settings, approvals, goal editor.
- Application services: agent, conversation, workflow, skill, run, artifact, integration, permission.
- Runtime: DeepAgents for autonomous agents; LangGraph for checkpointing, resumability, and future workflow execution.
- Tools and protocols: local files, shell, desktop, browser, search, Git, Feishu, MCP, ACP.
- Persistence: app SQLite for product data; LangGraph SQLite checkpoint DB for execution state; workspace files for memory/assets/artifacts; Electron Store for provider/model/key settings.

## Implemented

### Electron Shell

- Electron main/preload/renderer structure.
- Typed preload bridge with `contextIsolation: true`, `nodeIntegration: false`.
- Dev mode opens renderer DevTools automatically.
- Electron IPC is used for renderer/main communication; it does not appear in DevTools Network.

Key files:

- `src/main/index.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`

### Provider Settings

- OpenAI, Anthropic, and OpenAI-compatible providers.
- Provider metadata, model list, default provider, and encrypted API keys use `electron-store`.
- `.env.example` is only a first-run seed template.

Key files:

- `src/main/stores/settings-store.ts`
- `src/main/agent/provider-probe.ts`
- `.env.example`

### Agent Runtime

- Agents are built with `createDeepAgent`.
- Each agent has a DeepAgents `FilesystemBackend` in `virtualMode` scoped to its workspace.
- Custom product tools: Tavily search, clipboard, screenshot, app/path opening, goal steps.
- Subagents currently include `researcher` and `file_editor`.

Key files:

- `src/main/agent/agent-factory.ts`
- `src/main/agent/agent-registry.ts`
- `src/main/agent/tools/`
- `src/main/agent/subagents/`

### Streaming And Execution Visibility

- Text streaming uses LangGraph/DeepAgents message projections.
- Todo/files/tool activity use SDK stream projections and are bridged to renderer events.
- Assistant messages show live execution activity in the chat flow.
- Assistant messages can persist run tool events for Codex-like summary cards.
- Short continuation messages such as `继续` are expanded internally into explicit execution instructions.

Key files:

- `src/main/agent/stream-bridge.ts`
- `src/renderer/src/components/chat/MessageList.tsx`
- `src/renderer/src/stores/appStore.ts`

### Conversations

- Conversations are user-facing LangGraph/app threads.
- One agent can have multiple conversations with separate checkpointed state.
- Conversations can be created, selected, and deleted from the left sidebar.
- Deleting a conversation also deletes the corresponding LangGraph checkpoint thread.

Key files:

- `src/renderer/src/components/agent/AgentSidebar.tsx`
- `src/main/ipc.ts`

### Memory

- Long-term memory: DeepAgents-native `/memories/AGENTS.md` in each agent workspace.
- Session state: LangGraph `SqliteSaver` checkpoint keyed by `thread_id`.
- UI chat log: app `messages` table for display and audit, not the source of agent state.
- Legacy custom SQLite memory tables were removed.

Key files:

- `src/main/agent/agent-factory.ts`
- `src/main/agent/checkpointer.ts`
- `src/main/db/migrations.ts`

### Goal Progress

- Goal and active steps are injected with `alignmentMiddleware`.
- Periodic self-check uses the configured model as an evaluator.
- Goal steps are stored in SQLite and exposed to the agent through tools.
- `Re-plan` asks the agent to review the goal and continue from a fresh plan.

Key files:

- `src/main/agent/middleware/alignment-middleware.ts`
- `src/main/agent/alignment/self-check.ts`
- `src/main/agent/tools/milestone-tools.ts`
- `src/main/db/repositories/milestones.ts`

### Approval

- `execute`, `write_file`, and `edit_file` are intercepted by custom middleware.
- User can deny, allow once, allow for this chat, or always allow.
- Approval policies persist in SQLite.

Key files:

- `src/main/agent/approval-hook.ts`
- `src/main/db/repositories/approvals.ts`
- `src/renderer/src/components/chat/ApprovalModal.tsx`

### Workspace Opening

- `open_path` supports URLs, absolute OS paths, and DeepAgents workspace paths such as `/KFC-Thursday/index.html`.
- Workspace-relative paths are resolved to the real agent workspace before Electron `shell.openPath`.

Key files:

- `src/main/agent/tools/app-control.ts`

## Removed

- Custom SQLite long-term memory service and FTS.
- Memory extractor and memory IPC routes.
- Old memory panel.
- Agent memory tools: `save_memory`, `search_memory`, `list_recent_memories`, `pin_memory`, `forget_memory`.
- Default right-side technical state panel.

## Known Gaps

- Run summary cards are not fully actionable yet: diff review, per-file undo/revert, and open artifact actions need implementation.
- Built-in DeepAgents tool whitelist fields exist but need SDK-first enforcement via DeepAgents permissions/tool filtering.
- Approval flow works, but should be compared with native LangGraph/DeepAgents interrupt support.
- Old context panel components still exist in code and should be removed or repurposed as an optional artifact drawer.
- No user-facing memory editor yet.
- MCP server management and tool/resource bridge are not implemented.
- ACP support is not implemented.
- More end-to-end runtime smoke tests are needed with real providers.

## Next Steps

1. Make run summary cards actionable: open artifact, diff viewer, per-file review, undo/revert.
2. Enforce built-in tool permissions using DeepAgents SDK primitives.
3. Decide whether approval should migrate to native interrupt support.
4. Design MCP server registry, permissions, and tool bridge.
5. Define ACP support scope.
6. Add smoke tests for create agent -> send message -> checkpoint resume -> memory read/write -> artifact open.
7. Update README after the next implementation pass.

## Verification

Last verified locally:

- `npm run typecheck`
- `npm run build`
