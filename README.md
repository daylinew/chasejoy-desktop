# ChaseJoy Desktop

Personal AI desktop assistant powered by [LangChain DeepAgents](https://docs.langchain.com/oss/javascript/deepagents).
Built with Electron + React + Vite + TypeScript.

## Highlights

- **Multi-agent**: create as many specialised agents as you like (e.g. _Rust Learning Coach_, _SaaS CTO_, _Research Analyst_).
  Each agent has its own role, goal, isolated workspace, long-term memory and tool whitelist.
- **DeepAgents-native memory**: long-term memory lives in each agent workspace at `/memories/AGENTS.md`, loaded through
  DeepAgents' `memory` option and maintained with the built-in filesystem tools. Thread state is persisted with LangGraph
  `SqliteSaver` checkpoints.
- **Project NavBar — the anti-drift surface**: a top bar shows the agent's goal, milestone progress and a
  green/yellow/red alignment indicator. Every LLM call is wrapped by `alignmentMiddleware`, which
  dynamically prepends the goal and active milestones to the system prompt.
  A periodic self-check (LLM-as-judge) writes `alignment_events` to the DB; the user can click **Realign**
  at any time to force the agent to pause and re-plan.
- **Real toolset**: Tavily web search, clipboard read/write, screenshot capture, application launcher,
  plus DeepAgents' built-in `read_file / write_file / edit_file / glob / grep / ls / execute` tools
  sandboxed to a per-agent workspace with path permissions.
- **Dangerous-action approvals**: shell execution and file writes are intercepted by `approvalMiddleware`.
  The user approves _once_, _for the session_, or _trusts this agent permanently_; denied calls bubble back
  to the agent as a `ToolMessage`.
- **Provider neutral**: OpenAI, Anthropic, and any OpenAI-compatible endpoint (DeepSeek, Qwen, Moonshot,
  智谱, ...). API keys are encrypted at rest with Electron's `safeStorage`.
- **Sandboxed renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a minimal
  contextBridge surface defined in `src/shared/ipc-types.ts`.

## Quick start

```bash
npm install            # installs deps and pulls the Electron-compatible better-sqlite3 prebuild
npm run dev            # launches Electron with HMR for main/preload/renderer
```

On first launch open **Settings → Provider profiles → + Add profile** and paste an API key.
Then **+ New** in the agent sidebar to create your first agent — give it a clear, specific goal.

### Environment seeds (optional)

Copy `.env.example` to `.env`; values are read on first launch only to bootstrap settings.

| Variable                          | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `OPENAI_API_KEY`                  | Seeds an "OpenAI" profile                       |
| `ANTHROPIC_API_KEY`               | Seeds an "Anthropic" profile                    |
| `OPENAI_COMPAT_API_KEY` + `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_MODEL` | Seeds a DeepSeek/Qwen/Moonshot profile |
| `TAVILY_API_KEY`                  | Enables the `internet_search` tool              |

## Build a Windows installer

```bash
npm run package:win
```

Installer ends up under `release/<version>/`.
Native modules (`better-sqlite3`) are auto-unpacked from the ASAR via `electron-builder.yml`.

## Architecture overview

```
src/
  main/                       Electron main (Node.js)
    index.ts                  app lifecycle + window + IPC wiring
    ipc.ts                    ipcMain.handle for every ApiSurface method
    db/                       better-sqlite3, migrations, repositories
    stores/settings-store.ts  electron-store + safeStorage
    agent/
      agent-registry.ts       lazy-cache of per-agent DeepAgent runtimes
      agent-factory.ts        createDeepAgent + FilesystemBackend + middlewares
      stream-bridge.ts        run → persist → emit StreamEvents
      model-factory.ts        ChatOpenAI / ChatAnthropic (+ OpenAI-compat baseURL)
      checkpointer.ts         LangGraph SqliteSaver checkpoint lifecycle
      middleware/             alignmentMiddleware (anti-drift)
      approval-hook.ts        approvalMiddleware (dangerous tool gating)
      alignment/              self-check (LLM-as-judge)
      tools/                  search / clipboard / screenshot / app-control / milestones
      subagents/              researcher / file-editor
  preload/index.ts            contextBridge → window.chasejoy.{api,on,version}
  renderer/                   React UI (Vite)
    stores/appStore.ts        zustand store for agents/threads/messages/stream/...
    components/
      shell/AppShell.tsx       three-column layout (sidebar | chat | context)
      agent/                   AgentSidebar + NewAgentWizard
      project/                 ProjectNavBar + AlignmentBadge + GoalEditor
      chat/                    ChatView + MessageList + Composer + ApprovalModal
      context/                 Todos / Files tabs
      settings/                SettingsView (profiles + Tavily)
  shared/
    domain.ts                 shared TypeScript types
    ipc-types.ts              IPC channel names + ApiSurface contract
```

## Anti-drift mechanism (in detail)

1. **Static injection** — `alignmentMiddleware.wrapModelCall` runs before every LLM call.
   It builds a "project anchor" block containing: goal prompt, active+todo milestones,
   and completed-milestone count. This block is prepended to the system message, never to user messages, so the LLM
   re-reads its goal on every step without polluting the visible chat.
2. **Periodic self-check** — every N tool calls (default 4, configurable), the `runSelfCheck`
   judge asks a non-streaming LLM "is the last batch of actions serving the goal?" and writes
   the verdict (`green/yellow/red` + reasoning) to `alignment_events`. The UI shows this as a
   coloured dot in the ProjectNavBar.
3. **User-triggered realign** — the **Realign** button injects a synthetic system message that
   forces the agent to re-issue `write_todos` against the current goal.
4. **Approval hooks** — any `execute / write_file / edit_file` call is intercepted; the user
   can deny, allow once, allow for this session, or trust permanently per agent.

## Memory model

| Layer | Storage | Lifetime | Where it lives |
| ----- | ------- | -------- | -------------- |
| Thread state | LangGraph `SqliteSaver` checkpoint keyed by `thread_id` | within a thread | `langgraph-checkpoints.db` |
| Long-term memory | DeepAgents memory file `/memories/AGENTS.md` | across all threads of one agent | agent workspace |
| UI log | `messages` table | chat display / audit | app DB |

SQLite memories/FTS tables were removed; memory is no longer stored or searched through a custom repository.

## Troubleshooting

- **Electron download fails / very slow.** Pre-set a mirror before `npm install`:
  ```bash
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"   # Windows
  export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/     # macOS/Linux
  ```
- **`better-sqlite3` ABI mismatch.** Run `npm run rebuild`. It uses `prebuild-install`
  against the locally installed Electron version, so you don't need a C++ toolchain.
- **Provider key shows as missing.** Open Settings, edit the profile, paste the key, save.
  Keys are encrypted at rest with `safeStorage` and never written to logs.

See `c:/Users/.../chasejoy_desktop_agent_*.plan.md` for the full design rationale.
