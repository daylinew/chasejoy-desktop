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
  subagents: []
});

console.log("All property names of agent:", Object.getOwnPropertyNames(agent));
console.log("All property names of proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(agent)));
console.log("Keys of agent:", Object.keys(agent));

// Let's print the compiled graph if it is exposed.
// Check if there is any property that has 'graph' in it or returns CompiledGraph.
for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(agent))) {
  try {
    const val = agent[key];
    console.log(`Property '${key}':`, typeof val, val ? val.constructor.name : val);
  } catch (e) {
    console.log(`Property '${key}' getter threw:`, e.message);
  }
}
