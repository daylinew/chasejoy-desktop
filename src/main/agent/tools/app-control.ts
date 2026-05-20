import { shell } from "electron";
import { tool } from "@langchain/core/tools";
import { spawn } from "node:child_process";
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

export function makeOpenPathTool() {
  return tool(
    async ({ target }) => {
      try {
        if (/^https?:\/\//i.test(target)) {
          await shell.openExternal(target);
          return `Opened URL ${target} in default browser.`;
        }
        const err = await shell.openPath(target);
        if (err) return `Failed to open path: ${err}`;
        return `Opened ${target}.`;
      } catch (e) {
        return `Failed to open: ${(e as Error).message}`;
      }
    },
    {
      name: "open_path",
      description:
        "Open a file, folder, or URL with the system default handler. Pass an absolute file path for documents, a folder path to reveal it in Explorer/Finder, or an http(s) URL to open in the user's browser.",
      schema: z.object({
        target: z.string().describe("Absolute path or URL to open"),
      }),
    },
  );
}
