import { desktopCapturer, screen } from "electron";
import { tool } from "@langchain/core/tools";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Take a screenshot and write it into the agent's workspace.
 * The agent can then call read_file or pass the path to multimodal vision tools.
 */
export function makeScreenshotTool(opts: { workspaceDir: string }) {
  return tool(
    async ({ target, filename }) => {
      try {
        const displays = screen.getAllDisplays();
        const primary = screen.getPrimaryDisplay();
        const size = primary.size;
        const scale = primary.scaleFactor || 1;

        const sources = await desktopCapturer.getSources({
          types: target === "window" ? ["window"] : ["screen"],
          thumbnailSize: {
            width: Math.round(size.width * scale),
            height: Math.round(size.height * scale),
          },
          fetchWindowIcons: false,
        });

        if (sources.length === 0) return "No screenshot source available.";

        const chosen = sources[0]!;
        const png = chosen.thumbnail.toPNG();

        const screenshotsDir = path.join(opts.workspaceDir, ".screenshots");
        fs.mkdirSync(screenshotsDir, { recursive: true });

        const safeName = (filename ?? `shot-${Date.now()}.png`).replace(/[^a-z0-9._-]/gi, "_");
        const outPath = path.join(screenshotsDir, safeName);
        fs.writeFileSync(outPath, png);

        return JSON.stringify({
          path: outPath,
          width: size.width,
          height: size.height,
          target: chosen.name,
          allDisplays: displays.length,
        });
      } catch (err) {
        return `Screenshot failed: ${(err as Error).message}`;
      }
    },
    {
      name: "take_screenshot",
      description:
        "Capture a screenshot of the user's screen (or the foreground window) and store it in the agent's workspace under .screenshots/. Returns the absolute path so you can pass it to vision-capable downstream calls.",
      schema: z.object({
        target: z.enum(["screen", "window"]).default("screen").optional(),
        filename: z.string().optional().describe("Optional filename, default shot-<timestamp>.png"),
      }),
    },
  );
}
