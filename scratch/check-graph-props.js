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

const graph = agent.graph;
console.log("Graph constructor name:", graph.constructor.name);
console.log("Graph property names:", Object.getOwnPropertyNames(graph));
console.log("Graph prototype property names:", Object.getOwnPropertyNames(Object.getPrototypeOf(graph)));

// Check if streamTransformers exists on graph or agent
console.log("graph.streamTransformers:", graph.streamTransformers);
console.log("agent.streamTransformers:", agent.streamTransformers);
console.log("agent.graph.streamTransformers:", agent.graph.streamTransformers);
