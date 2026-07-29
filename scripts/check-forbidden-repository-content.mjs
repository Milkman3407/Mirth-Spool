/* global console */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const forbiddenSegments = [
  /^\.codex-/iu,
  /^\.codex-transfer/iu,
  /^(?:transfer|publish)-snapshot/iu,
  /^console-capture/iu,
  /^\.secrets$/iu,
];
const forbiddenNames = [/(?:^|[-_.])console-capture(?:[-_.]|$)/iu];
const forbiddenExtensions = new Set([
  ".7z",
  ".bak",
  ".backup",
  ".bz2",
  ".db",
  ".dump",
  ".gz",
  ".jks",
  ".kdbx",
  ".key",
  ".keystore",
  ".log",
  ".p12",
  ".pem",
  ".pfx",
  ".ppm",
  ".rar",
  ".sqlite",
  ".sqlite3",
  ".state",
  ".tar",
  ".tbz2",
  ".tgz",
  ".txz",
  ".xz",
  ".zip",
]);

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\0")
    .filter((file) => file && existsSync(file));
}

export function forbiddenReason(file) {
  const normalized = file.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const basename = segments.at(-1) ?? "";
  const lower = basename.toLowerCase();

  if (
    segments.some((segment) =>
      forbiddenSegments.some((rule) => rule.test(segment)),
    )
  ) {
    return "forbidden local/transfer directory";
  }
  if (forbiddenNames.some((rule) => rule.test(basename))) {
    return "credential or console-capture filename";
  }
  if ([...forbiddenExtensions].some((extension) => lower.endsWith(extension))) {
    return "archive, credential, database, backup, log, image-capture, or state file";
  }
  if (path.posix.basename(normalized) === ".gitleaksignore") {
    return "secret-scan allowlist";
  }
  return undefined;
}

const violations = trackedFiles()
  .map((file) => ({ file, reason: forbiddenReason(file) }))
  .filter(({ reason }) => reason);

if (violations.length > 0) {
  throw new Error(
    `Forbidden repository content detected:\n${violations
      .map(({ file, reason }) => `- ${file}: ${reason}`)
      .join("\n")}`,
  );
}

console.log("Repository forbidden-path and archive policy passed.");
