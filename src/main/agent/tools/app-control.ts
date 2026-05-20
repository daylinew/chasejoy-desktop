import { shell } from "electron";
import { tool } from "@langchain/core/tools";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function launchByName(name: string): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const platform = process.platform;
    try {
      if (platform === "win32") {
        const child = spawn("cmd.exe", ["/c", "start", "", name], { detached: true, stdio: "ignore" });
        child.on("error", (e) => resolve({ ok: false, message: e.message }));
        child.unref();
        setTimeout(() => resolve({ ok: true, message: `Launched ${name} via cmd start.` }), 200);
      } else if (platform === "darwin") {
        const child = spawn("open", ["-a", name], { detached: true, stdio: "ignore" });
        child.on("error", (e) => resolve({ ok: false, message: e.message }));
        child.unref();
        setTimeout(() => resolve({ ok: true, message: `Launched ${name} via open -a.` }), 200);
      } else {
        const child = spawn("xdg-open", [name], { detached: true, stdio: "ignore" });
        child.on("error", (e) => resolve({ ok: false, message: e.message }));
        child.unref();
        setTimeout(() => resolve({ ok: true, message: `Launched ${name} via xdg-open.` }), 200);
      }
    } catch (e) {
      resolve({ ok: false, message: (e as Error).message });
    }
  });
}

export function makeOpenAppTool() {
  return tool(
    async ({ name }) => {
      const r = await launchByName(name);
      return r.message;
    },
    {
      name: "open_app",
      description:
        "Launch a desktop application by name. On Windows uses `start`, macOS uses `open -a`, Linux uses `xdg-open`. Example: open_app('Code') to start VS Code.",
      schema: z.object({
        name: z.string().describe("Application name as known to the OS"),
      }),
    },
  );
}

export function makeOpenPathTool(opts: { workspaceDir: string }) {
  return tool(
    async ({ target }) => {
      try {
        if (/^https?:\/\//i.test(target)) {
          await shell.openExternal(target);
          return `Opened URL ${target} in default browser.`;
        }
        const resolved = resolveOpenTarget(target, opts.workspaceDir);
        if (!resolved) {
          return `Failed to open path: ${target}. The file does not exist in the workspace or on disk.`;
        }
        const err = await shell.openPath(resolved);
        if (err) return `Failed to open path ${resolved}: ${err}`;
        return `Opened ${resolved}.`;
      } catch (e) {
        return `Failed to open: ${(e as Error).message}`;
      }
    },
    {
      name: "open_path",
      description:
        "Open a file, folder, or URL with the system default handler. You may pass an absolute OS path or a workspace-relative/virtual path such as /index.html or /folder/file.html.",
      schema: z.object({
        target: z.string().describe("Absolute path, workspace path, or URL to open"),
      }),
    },
  );
}

function resolveOpenTarget(target: string, workspaceDir: string): string | null {
  const trimmed = target.trim();
  const candidates = [trimmed];

  if (!path.isAbsolute(trimmed)) {
    candidates.push(path.join(workspaceDir, trimmed));
  }

  const virtualLike = trimmed.startsWith("/") || trimmed.startsWith("\\");
  if (virtualLike && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    candidates.push(path.join(workspaceDir, trimmed.replace(/^[\\/]+/, "")));
  }

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (fs.existsSync(normalized)) return normalized;
  }
  return null;
}
