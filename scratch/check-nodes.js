import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import fs from "node:fs";

const workspaceDir = "./scratch/mock-workspace";
const model = new ChatOpenAI({ openAIApiKey: "mock-key", modelName: "gpt-4o" });
const backend = new FilesystemBackend({ rootDir: workspaceDir, virtualMode: true });

const agent = createDeepAgent({
  model,
  backend,
  systemPrompt: "You are a helpful assistant.",
  tools: [],
  subagents: [{
    name: "research",
    description: "research specialist"
  }]
});

// Print the nodes of the graph
console.log("Nodes in agent.graph:", Object.keys(agent.graph.nodes));
