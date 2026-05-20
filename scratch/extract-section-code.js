import fs from "node:fs";

const file = "C:/Users/23599/.gemini/antigravity/brain/f1a02aa6-43cd-4d23-8551-1aa7513d50ff/.system_generated/steps/28/content.md";
const code = fs.readFileSync(file, "utf8");

// Let's locate headings in the HTML
// Format is: <h2 ...>...Building the SubagentCard...</h2>
// We want to find headings that are NOT in the TOC (so they don't have <a href= inside them, or they are actual headers)
const headingsRegex = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/g;
let match;
const sections = [];

while ((match = headingsRegex.exec(code)) !== null) {
  const tag = match[1];
  const innerHtml = match[2];
  const text = innerHtml.replace(/<[^>]+>/g, "").replace(/\u200b/g, "").trim();
  const startIdx = match.index;
  sections.push({
    tag,
    text,
    startIdx,
    endIdx: startIdx + match[0].length
  });
}

// Map each section to its content ending at the next heading of same or higher level
for (let i = 0; i < sections.length; i++) {
  const current = sections[i];
  // Skip TOC entries (TOC entries don't have class or id, or we can just filter by their text)
  if (current.text === "Overview" || current.text === "Architecture" || current.text === "Frontend Patterns") {
    // These are main sections
  }
  
  let endIdx = code.length;
  for (let j = i + 1; j < sections.length; j++) {
    if (sections[j].tag === current.tag || sections[j].tag === "h1" || sections[j].tag === "h2") {
      endIdx = sections[j].startIdx;
      break;
    }
  }
  
  current.htmlContent = code.slice(current.endIdx, endIdx);
}

// Print sections we want
const targets = [
  "Building the SubagentCard",
  "Status icons and badges",
  "Progress tracking",
  "Rendering messages with subagent cards",
  "Synthesis indicator"
];

for (const t of targets) {
  const section = sections.find(s => s.text === t);
  if (section) {
    console.log(`\n==================================================`);
    console.log(`=== SECTION: ${section.text} (${section.tag}) ===`);
    console.log(`==================================================`);
    
    // Extract code blocks inside this section's htmlContent
    // Since shiki might output code blocks inside div.code-block and pre, let's extract them
    const preRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/g;
    let codeMatch;
    let count = 0;
    while ((codeMatch = preRegex.exec(section.htmlContent)) !== null) {
      const cleanCode = codeMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"');
      console.log(`\n--- Code Block ${count++} ---`);
      console.log(cleanCode.trim());
    }
  } else {
    console.log(`=== Target heading "${t}" not found in sections ===`);
  }
}
