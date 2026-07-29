import { readdir, readFile } from "node:fs/promises";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoots = ["apps/web/src", "packages/ui/src"];
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

export function importedSpecifiers(source) {
  const importPattern =
    /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']|import\s*["']([^"']+)["']/gu;

  return [...source.matchAll(importPattern)]
    .map((match) => (match[1] ?? match[2])?.replaceAll("\\", "/"))
    .filter(Boolean);
}

export function containsServerOnlyImport(source) {
  return importedSpecifiers(source).some((specifier) => {
    return forbiddenSpecifiers.some(
      (forbidden) =>
        specifier === forbidden ||
        specifier?.endsWith(`/${forbidden}`) ||
        specifier?.includes("/packages/config/src/server"),
    );
  });
}

function isClientModule(source) {
  return /^\s*["']use client["'];/u.test(source);
}

function resolveRelativeImport(fromFile, specifier, sourceFileSet) {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...[...sourceExtensions].map((extension) => `${base}${extension}`),
    ...[...sourceExtensions].map((extension) =>
      path.join(base, `index${extension}`),
    ),
  ];
  return candidates.find((candidate) => sourceFileSet.has(candidate));
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
      sourceRoots.map((root) =>
        collectSourceFiles(path.join(repositoryRoot, root)),
      ),
    )
  ).flat();
  const sourceFileSet = new Set(files.map((file) => path.resolve(file)));
  const sources = new Map(
    await Promise.all(
      files.map(async (file) => [
        path.resolve(file),
        await readFile(file, "utf8"),
      ]),
    ),
  );
  const queue = [
    ...[...sources]
      .filter(([, source]) => isClientModule(source))
      .map(([file]) => file),
    ...files.filter((file) =>
      file.replaceAll("\\", "/").includes("/packages/ui/src/"),
    ),
  ];
  const visited = new Set();
  const violations = [];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) {
      continue;
    }
    visited.add(file);
    const source = sources.get(file) ?? "";
    if (containsServerOnlyImport(source)) {
      violations.push(path.relative(repositoryRoot, file));
    }
    for (const specifier of importedSpecifiers(source)) {
      const dependency = resolveRelativeImport(file, specifier, sourceFileSet);
      if (dependency) {
        queue.push(dependency);
      }
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
