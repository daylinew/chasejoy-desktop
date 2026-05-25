# ChaseJoy Desktop Project Navigation

Last updated: 2026-05-25

## North Star

ChaseJoy is a desktop Base Agent platform. It should let users build and run their own personal agent system through natural language, local context, reusable assets, visible execution, approvals, and artifacts.

It is not a fixed vertical app and not a simple chatbot. Product scenarios such as coding review, test generation, Feishu assistant, or document creation should be buildable assets on top of the platform.

Core rule: use DeepAgents, LangChain, and LangGraph SDK capabilities first. Only write custom code for product-specific behavior the SDK does not cover.

Issue retrospectives and recurring problem records live in `PROJECT_ISSUES.md`.

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
- Use `Goal` / `Goal steps` for goal management. Avoid a global top progress bar unless it directly helps the current run.
- Do not put persistent goal-management controls in the top bar by default. Goal management should be contextual, not a permanent primary action.
- Hide alignment state when no check has happened.

## Architecture

- Renderer UI: chat, execution cards, asset cards, settings, approvals, goal editor.
- Application services: agent, conversation, workflow, skill, run, artifact, integration, permission.
- Runtime: DeepAgents for autonomous agents; LangGraph for checkpointing, resumability, and future workflow execution.
- Tools and protocols: local files, shell, desktop, browser, search, Git, Feishu, MCP, ACP.
- Persistence: app SQLite for product data; LangGraph SQLite checkpoint DB for execution state; workspace files for memory/assets/artifacts; Electron Store for provider/model/key settings.

## Context Engineering

ChaseJoy should follow DeepAgents/LangChain context engineering instead of building a custom prompt-stuffing layer.

User-facing concepts:

- Work directory: where the agent can inspect, edit, run, and create artifacts.
- Attached files: explicit short-term context for the current task.
- Skills: reusable methods and domain workflows loaded on demand.
- Memory: durable facts, preferences, project conventions, and important artifact references.
- Run history: visible execution trace and result summary, not raw internal state.

Internal mapping:

- Input context: base system prompt, concise `/memories/AGENTS.md`, skill frontmatter, and tool descriptions.
- Runtime context: current agent, conversation, workspace, selected files, provider/model, permissions, integration identities, and protocol connections.
- Short-term state: LangGraph checkpoint per conversation.
- Long-term memory: DeepAgents filesystem-backed memory under `/memories/`, routed through SDK backends where cross-thread persistence is needed.
- Context compression: prefer DeepAgents built-in offloading and summarization instead of manually trimming messages.
- Context isolation: use DeepAgents subagents for heavy research, large file inspection, and focused edits so the main agent receives concise results.

Rules:

- Do not inject every visible product record into the prompt. Pass structured runtime context to tools/middleware and expose only what the agent needs.
- Keep memory small and always-relevant. Detailed procedures belong in skills, not memory.
- Keep skills focused. A workflow can reference a skill, but workflow execution state should remain a run record.
- Large tool outputs and generated artifacts should live in workspace files; chat should link or summarize them.
- UI labels should stay product-facing: `Files`, `Work directory`, `Skills`, `Memory`, `Runs`. Avoid exposing `checkpoint`, `runtime context`, `sandbox`, or `stream events`.

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

### Model Service Settings

- OpenAI, DeepSeek, Anthropic, OpenAI-compatible, and Anthropic-compatible model services.
- Provider metadata, model list, default provider, and encrypted API keys use `electron-store`.
- `.env.example` is only a first-run seed template.
- DeepSeek is a first-class service backed by LangChain's official `@langchain/deepseek` `ChatDeepSeek` integration, defaulting to `https://api.deepseek.com`. Do not route DeepSeek through Anthropic-compatible or custom payload patch paths unless the official provider is proven insufficient.
- The settings flow follows the Chatbox-style model-service pattern: pick a service, enter API key/Base URL, test connection, then select or manually add model IDs.

Key files:

- `src/main/stores/settings-store.ts`
- `src/main/agent/provider-probe.ts`
- `src/main/agent/model-factory.ts`
- `.env.example`

### Agent Runtime

- Agents are built with `createDeepAgent`.
- Each agent has a DeepAgents `FilesystemBackend` in `virtualMode` scoped to its workspace.
- Custom product tools: Tavily search, clipboard, screenshot, app/path opening, goal steps.
- Subagents currently include `researcher` and `file_editor`.
- Context follows SDK structure: system prompt + memory + tools + subagents + LangGraph checkpoint.

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

### Run Context Selection

- Composer exposes the selected work directory and attached files as visible context chips.
- File attachments are sent as structured `context` to DeepAgents, not prepended into the user message.
- DeepAgents `contextSchema` validates per-run context, and middleware turns only the useful summary into the model prompt.
- If a selected file is outside the current work directory, the composer shifts the work directory to that file's parent so the virtual filesystem can read it.

Key files:

- `src/renderer/src/components/chat/Composer.tsx`
- `src/renderer/src/stores/appStore.ts`
- `src/shared/domain.ts`
- `src/shared/ipc-types.ts`
- `src/main/agent/agent-factory.ts`
- `src/main/agent/middleware/alignment-middleware.ts`

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
- Memory should store concise durable context only; detailed repeatable methods should become skills.
- DeepSeek V4 Pro thinking/tool-call runs require provider reasoning state to survive in checkpointed assistant history. Use `ChatDeepSeek` and LangGraph/DeepAgents checkpointing as the primary path, and do not manually strip provider metadata from model messages.

Key files:

- `src/main/agent/agent-factory.ts`
- `src/main/agent/checkpointer.ts`
- `src/main/db/migrations.ts`

### Goal Management

- Goal and active steps are injected with `alignmentMiddleware`.
- Periodic self-check uses the configured model as an evaluator.
- Goal steps are stored in SQLite and exposed to the agent through tools.
- Re-planning remains an agent capability, but it should be triggered contextually from the conversation or future run controls, not as a permanent top-bar button.
- Goal progress should live in goal details or run context, not as a permanent top-level progress bar.

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
- Context attachment flow is still basic: folder attachments, context preview, and per-run permission scoping need more polish.
- Built-in DeepAgents tool whitelist fields exist but need SDK-first enforcement via DeepAgents permissions/tool filtering.
- Approval flow works, but should be compared with native LangGraph/DeepAgents interrupt support.
- Old context panel components still exist in code and should be removed or repurposed as an optional artifact drawer.
- No user-facing memory editor yet.
- MCP server management and tool/resource bridge are not implemented.
- ACP support is not implemented.
- More end-to-end runtime smoke tests are needed with real providers.

## Next Steps

1. Make run summary cards actionable: open artifact, diff viewer, per-file review, undo/revert.
2. Add folder attachments, context preview, and per-run permission scope to composer context.
3. Enforce built-in tool permissions using DeepAgents SDK primitives.
4. Decide whether approval should migrate to native LangGraph/DeepAgents interrupt support.
5. Design MCP server registry, permissions, and tool bridge.
6. Define ACP support scope.
7. Add smoke tests for create agent -> send message -> checkpoint resume -> memory read/write -> artifact open.
8. Update README after the next implementation pass.

## Verification

Last verified locally:

- `npm run typecheck`
- `npm run build`
