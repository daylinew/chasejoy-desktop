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
    return {
      generations: [{
        text: "Hello from Mock!",
        message: new AIMessage("Hello from Mock!")
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
  subagents: []
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

for await (const event of run) {
  if (event.method === "updates") {
    console.log("UPDATE EVENT:", JSON.stringify(event.params?.data, null, 2));
  }
}
