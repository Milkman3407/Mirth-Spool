import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", ".next"]);
const markdownFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name.endsWith(".md")) markdownFiles.push(absolute);
  }
}

walk(root);
const failures = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const markdownFile of markdownFiles) {
  const contents = fs.readFileSync(markdownFile, "utf8");
  for (const match of contents.matchAll(linkPattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:") ||
      target.startsWith("#")
    ) {
      continue;
    }
    const localPath = decodeURIComponent(target.split("#", 1)[0]);
    if (!localPath) continue;
    const resolved = path.resolve(path.dirname(markdownFile), localPath);
    if (!fs.existsSync(resolved)) {
      failures.push(
        `${path.relative(root, markdownFile)}: missing local link ${target}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`checked ${markdownFiles.length} Markdown files`);
}
