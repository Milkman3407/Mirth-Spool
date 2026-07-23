import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const version = packageJson.version;
const expectedTag = `v${version}`;
const suppliedTag = process.env.MIRTHSPOOL_RELEASE_TAG;
const releaseNotesPath = `docs/releases/${expectedTag}.md`;

function fail(message) {
  console.error(`release verification failed: ${message}`);
  process.exitCode = 1;
}

if (!/^0\.1\.\d+$/.test(version)) {
  fail(`package version ${version} is not an allowed v0.1 semantic version`);
}

if (suppliedTag && suppliedTag !== expectedTag) {
  fail(`tag ${suppliedTag} does not match package version ${expectedTag}`);
}

if (packageJson.license !== "Apache-2.0") {
  fail(`package license ${String(packageJson.license)} is not Apache-2.0`);
}

const requiredText = new Map([
  ["CHANGELOG.md", [`## [${version}]`]],
  ["LICENSE", ["Apache License", "Version 2.0, January 2004"]],
  ["apps/web/Dockerfile", ['org.opencontainers.image.licenses="Apache-2.0"']],
  [
    "apps/worker/Dockerfile",
    ['org.opencontainers.image.licenses="Apache-2.0"'],
  ],
  [releaseNotesPath, [`# MirthSpool ${expectedTag}`]],
  [
    "compose.release.yaml",
    [`mirth-spool-web:${version}`, `mirth-spool-worker:${version}`],
  ],
  ["docs/INSTALL.md", ["sha256:", "linux/amd64"]],
]);

for (const [relativePath, snippets] of requiredText) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`missing ${relativePath}`);
    continue;
  }
  const contents = fs.readFileSync(absolutePath, "utf8");
  for (const snippet of snippets) {
    if (!contents.includes(snippet)) {
      fail(`${relativePath} is missing ${JSON.stringify(snippet)}`);
    }
  }
}

if (!process.exitCode) {
  console.log(`release ${expectedTag} metadata is internally consistent`);
}
