import fs from "node:fs";

const file = "C:/Users/23599/.gemini/antigravity/brain/f1a02aa6-43cd-4d23-8551-1aa7513d50ff/.system_generated/steps/28/content.md";
const content = fs.readFileSync(file, "utf8");

// Search for matches of GraphRunStream and print surrounding context
const regex = /.{0,100}GraphRunStream.{0,100}/gi;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(match[0].replace(/\s+/g, " "));
}
