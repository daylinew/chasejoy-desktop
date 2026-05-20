import fs from "node:fs";

const file = "C:/Users/23599/.gemini/antigravity/brain/f1a02aa6-43cd-4d23-8551-1aa7513d50ff/.system_generated/steps/28/content.md";
const code = fs.readFileSync(file, "utf8");

// Convert HTML to clean plain text
const txt = code
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

const headings = [
  "Building the SubagentCard",
  "Status icons and badges",
  "Progress tracking",
  "Rendering messages with subagent cards",
  "Synthesis indicator"
];

for (const h of headings) {
  const idx = txt.indexOf(h);
  if (idx !== -1) {
    console.log(`=== ${h} ===`);
    console.log(txt.slice(idx, idx + 2000));
    console.log("\n");
  } else {
    console.log(`=== ${h} === NOT FOUND\n`);
  }
}
