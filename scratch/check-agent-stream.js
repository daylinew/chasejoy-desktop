import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import fs from "node:fs";
import path from "node:path";

// Ensure mock workspace exists
const workspaceDir = "./scratch/mock-workspace";
fs.mkdirSync(workspaceDir, { recursive: true });

const model = new ChatOpenAI({ openAIApiKey: "mock-key", modelName: "gpt-4o" });
const backend = new FilesystemBackend({ rootDir: workspaceDir, virtualMode: true });

const agent = createDeepAgent({
  model,
  backend,
  systemPrompt: "You are a helpful assistant.",
  tools: [],
  subagents: []
});

console.log("Agent keys:", Object.keys(agent));
console.log("Agent stream function:", agent.stream.toString().slice(0, 300));

// Let's call stream and inspect what type it returns
const runStream = await agent.stream({ messages: [{ role: "user", content: "hello" }] });
console.log("runStream constructor name:", runStream.constructor.name);
console.log("runStream keys:", Object.keys(runStream));
console.log("runStream prototype keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(runStream)));
console.log("runStream.subagents exists?", !!runStream.subagents);
