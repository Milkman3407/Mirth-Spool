/* global console */

import process from "node:process";

const digestPattern =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*\/)+[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$/u;

const fields = ["MIRTHSPOOL_WEB_IMAGE", "MIRTHSPOOL_WORKER_IMAGE"];
const invalid = fields.filter(
  (field) => !digestPattern.test(process.env[field] ?? ""),
);

if (invalid.length > 0) {
  console.error(
    `release image validation failed: ${invalid.join(", ")} must be immutable ghcr.io/...@sha256:<64 lowercase hex> references`,
  );
  process.exitCode = 1;
} else {
  console.log("release image references are immutable digest pins");
}
