import { clipboard, nativeImage } from "electron";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function makeClipboardReadTool() {
  return tool(
    async () => {
      const text = clipboard.readText();
      const image = clipboard.readImage();
      const hasImage = !image.isEmpty();
      return JSON.stringify({
        textLength: text.length,
        text: text.slice(0, 8_000),
        hasImage,
        imageSize: hasImage ? image.getSize() : null,
      });
    },
    {
      name: "clipboard_read",
      description:
        "Read the current text on the user's clipboard (truncated to 8K chars). Returns JSON with text plus a flag for image content.",
      schema: z.object({}),
    },
  );
}

export function makeClipboardWriteTool() {
  return tool(
    async ({ text }) => {
      clipboard.writeText(text);
      return `Wrote ${text.length} characters to clipboard.`;
    },
    {
      name: "clipboard_write",
      description: "Replace the user's clipboard with the given text.",
      schema: z.object({
        text: z.string(),
      }),
    },
  );
}

/** Helper for callers that want to set raw image content. */
export function writeImageToClipboard(buffer: Buffer): void {
  clipboard.writeImage(nativeImage.createFromBuffer(buffer));
}
