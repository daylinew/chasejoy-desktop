import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { createGraphRunStream } from "@langchain/langgraph";
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

const rawStream = await agent.stream(
  { messages: [{ role: "user", content: "hello" }] },
  { subgraphs: true } // Subgraph streaming requires subgraphs: true!
);

const run = createGraphRunStream(
  rawStream,
  agent.graph.streamTransformers,
  { abortController: new AbortController() }
);

console.log("Root stream created!");
console.log("run.subagents exists?", !!run.subagents);

// Let's print the prototype chain or getters on run to see subagents
console.log("run properties:", Object.getOwnPropertyNames(run));
console.log("run proto property names:", Object.getOwnPropertyNames(Object.getPrototypeOf(run)));
console.log("run.subagents:", run.subagents);
