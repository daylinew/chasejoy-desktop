import { createDeepAgent, FilesystemBackend } from "deepagents";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import { createGraphRunStream } from "@langchain/langgraph";
import fs from "node:fs";

class MockChatModel extends BaseChatModel {
  constructor() {
    super({});
  }
  _llmType() { return "mock"; }
  bindTools(tools) {
    return this;
  }
  async _generate(messages, options, runManager) {
    // Return a tool call to 'task' to trigger subagent spawning
    return {
      generations: [{
        text: "Spawning a subagent...",
        message: new AIMessage({
          content: "Spawning a subagent...",
          tool_calls: [{
            id: "call_123",
            name: "task",
            args: {
              subagent_type: "research",
              description: "Search for langchain docs"
            }
          }]
        })
      }]
    };
  }
}

const workspaceDir = "./scratch/mock-workspace";
const model = new MockChatModel();
const backend = new FilesystemBackend({ rootDir: workspaceDir, virtualMode: true });

const agent = createDeepAgent({
  model,
  backend,
  systemPrompt: "You are a helpful assistant.",
  tools: [],
  subagents: [{
    name: "research",
    description: "research specialist",
    systemPrompt: "Research stuff",
    tools: []
  }]
});

const rawStream = await agent.stream(
  { messages: [{ role: "user", content: "hello" }] },
  {
    subgraphs: true,
    streamMode: ["values", "updates"]
  }
);

const run = createGraphRunStream(
  rawStream,
  agent.graph.streamTransformers,
  { abortController: new AbortController() }
);

// We run the event loop and subagent loop concurrently
const eventLoop = async () => {
  for await (const event of run) {
    // console.log("Event:", event.method);
  }
};

const subagentsLoop = async () => {
  console.log("Waiting for subagents...");
  for await (const subagent of run.subagents) {
    console.log("SPAWNED SUBAGENT:", subagent.name);
    console.log("Task Input Promise:", subagent.taskInput);
    const desc = await subagent.taskInput;
    console.log("Task Description:", desc);

    // Let's listen to messages inside the subagent
    const messagesLoop = async () => {
      for await (const msg of subagent.messages) {
        console.log(`Subagent [${subagent.name}] Message:`, msg);
      }
    };

    // Let's listen to tool calls inside the subagent
    const toolCallsLoop = async () => {
      for await (const tc of subagent.toolCalls) {
        console.log(`Subagent [${subagent.name}] Tool Call:`, tc);
      }
    };

    void messagesLoop();
    void toolCallsLoop();

    subagent.output.then((out) => {
      console.log(`Subagent [${subagent.name}] Finished with output:`, out);
    }).catch(err => {
      console.log(`Subagent [${subagent.name}] Errored:`, err.message);
    });
  }
};

await Promise.all([eventLoop(), subagentsLoop()]);
console.log("All finished!");
