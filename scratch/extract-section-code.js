import fs from "node:fs";

const file = "C:/Users/23599/.gemini/antigravity/brain/f1a02aa6-43cd-4d23-8551-1aa7513d50ff/.system_generated/steps/28/content.md";
const code = fs.readFileSync(file, "utf8");

// Remove all zero width spaces
const cleanCodeStr = code.replace(/\u200b/g, "");

function printSection(headerName) {
  const startIdx = cleanCodeStr.indexOf(headerName);
  if (startIdx === -1) {
    console.log(`=== ${headerName} NOT FOUND ===`);
    return;
  }
  
  // Find the next heading tag to stop
  const nextHeadingIdx = cleanCodeStr.slice(startIdx + 10).search(/<h[1-6]/);
  const endIdx = nextHeadingIdx === -1 ? cleanCodeStr.length : startIdx + 10 + nextHeadingIdx;
  
  const sectionHtml = cleanCodeStr.slice(startIdx, endIdx);
  
  // Extract all code blocks inside this HTML snippet
  // Let's find all occurrences of <pre ...>...</pre>
  const preRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/g;
  let match;
  let count = 0;
  while ((match = preRegex.exec(sectionHtml)) !== null) {
    const cleanCode = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
    console.log(`\n--- Code Block ${count++} ---`);
    console.log(cleanCode);
  }
}

console.log("=== BUILDING THE SUBAGENT CARD ===");
printSection("Building the SubagentCard");

console.log("\n=== STATUS ICONS AND BADGES ===");
printSection("Status icons and badges");

console.log("\n=== RENDERING MESSAGES WITH SUBAGENT CARDS ===");
printSection("Rendering messages with subagent cards");

console.log("\n=== SYNTHESIS INDICATOR ===");
printSection("Synthesis indicator");
