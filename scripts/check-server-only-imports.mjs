import { readdir, readFile } from "node:fs/promises";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const browserRoots = ["apps/web/src/client", "packages/ui/src"];
const sourceExtensions = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const forbiddenSpecifiers = [
  "@mirthspool/config/server",
  "packages/config/src/server",
  "packages/config/src/server.ts",
];

export function containsServerOnlyImport(source) {
  const importPattern =
    /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu;

  return [...source.matchAll(importPattern)].some((match) => {
    const specifier = match[1]?.replaceAll("\\", "/");
    return forbiddenSpecifiers.some(
      (forbidden) =>
        specifier === forbidden ||
        specifier?.endsWith(`/${forbidden}`) ||
        specifier?.includes("/packages/config/src/server"),
    );
  });
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    },
  );
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const files = (
    await Promise.all(
      browserRoots.map((root) =>
        collectSourceFiles(path.join(repositoryRoot, root)),
      ),
    )
  ).flat();
  const violations = [];

  for (const file of files) {
    if (containsServerOnlyImport(await readFile(file, "utf8"))) {
      violations.push(path.relative(repositoryRoot, file));
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Server-only configuration imported by browser code:\n${violations.map((file) => `- ${file}`).join("\n")}`,
    );
  }

  console.log("Server/client configuration boundary check passed.");
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  await main();
}
