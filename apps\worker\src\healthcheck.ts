import { stat } from "node:fs/promises";
import process from "node:process";

const heartbeatPath = "/tmp/mirthspool-worker-heartbeat";
const maximumAgeMs = 35_000;

try {
  const heartbeat = await stat(heartbeatPath);
  if (Date.now() - heartbeat.mtimeMs > maximumAgeMs) {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
