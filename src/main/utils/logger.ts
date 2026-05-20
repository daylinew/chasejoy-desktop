import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

let logFile: string | null = null;

function ensureLogFile(): string {
  if (logFile) return logFile;
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  logFile = path.join(dir, `chasejoy-${stamp}.log`);
  return logFile;
}

function ts(): string {
  return new Date().toISOString();
}

function writeLine(level: string, scope: string, msg: string): void {
  const line = `[${ts()}] [${level}] [${scope}] ${msg}\n`;
  try {
    fs.appendFileSync(ensureLogFile(), line, "utf8");
  } catch {
    /* ignore */
  }
  const out = level === "ERROR" || level === "WARN" ? process.stderr : process.stdout;
  out.write(line);
}

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function createLogger(scope: string) {
  return {
    info: (...args: unknown[]) => writeLine("INFO", scope, fmt(args)),
    warn: (...args: unknown[]) => writeLine("WARN", scope, fmt(args)),
    error: (...args: unknown[]) => writeLine("ERROR", scope, fmt(args)),
    debug: (...args: unknown[]) => {
      if (process.env["CHASEJOY_DEBUG"]) writeLine("DEBUG", scope, fmt(args));
    },
  };
}

export function installGlobalCrashHandlers(): void {
  const log = createLogger("crash");
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", reason);
  });
}
