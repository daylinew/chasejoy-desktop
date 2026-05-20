import { app } from "electron";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import fs from "node:fs";
import path from "node:path";

let checkpointer: SqliteSaver | null = null;

export function getAgentCheckpointer(): SqliteSaver {
  if (checkpointer) return checkpointer;

  const dbDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dbDir, { recursive: true });
  checkpointer = SqliteSaver.fromConnString(path.join(dbDir, "langgraph-checkpoints.db"));
  return checkpointer;
}

export function closeAgentCheckpointer(): void {
  if (!checkpointer) return;
  checkpointer.db.close();
  checkpointer = null;
}
