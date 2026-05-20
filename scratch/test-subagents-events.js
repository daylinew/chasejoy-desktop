import { createDeepAgent, FilesystemBackend } from "deepagents";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import { createGraphRunStream } from "@langchain/langgraph";
import fs from "node:fs";

class MockChatModel extends BaseChatModel {
  called = false;
  constructor() {
    super({});
  }
  _llmType() { return "mock"; }
  bindTools(tools) {
    return this;
  }
  async _generate(messages, options, runManager) {
    if (!this.called) {
      this.called = true;
      return {
        generations: [{
          text: "Spawning research subagent...",
          message: new AIMessage({
            content: "Spawning research subagent...",
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
    } else {
      return {
        generations: [{
          text: "Subagent completed the work successfully.",
          message: new AIMessage("Subagent completed the work successfully.")
        }]
      };
    }
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
    streamMode: ["values", "updates", "messages", "tools"]
  }
);

const run = createGraphRunStream(
  rawStream,
  agent.graph.streamTransformers,
  { abortController: new AbortController() }
);

const eventLoop = async () => {
  for await (const event of run) {
    console.log(`Event Method: ${event.method}`);
    console.log("Event Params:", JSON.stringify(event.params, null, 2));
  }
};

const subagentsLoop = async () => {
  for await (const subagent of run.subagents) {
    console.log("SPAWNED SUBAGENT:", subagent.name);
    const desc = await subagent.taskInput;
    console.log("Task Description:", desc);
    const output = await subagent.output;
    console.log("Task Output:", output);
  }
};

await Promise.all([eventLoop(), subagentsLoop()]);
console.log("Stream finished!");
