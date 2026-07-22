import { describe, expect, it, vi } from "vitest";

import {
  assertDuplicateDetectionJobData,
  assertSourcePollJobData,
  enqueueDuplicateDetection,
  enqueueMediaCache,
  enqueueSourcePoll,
  sourcePollJobId,
} from "./queues.js";

const data = {
  requestedAt: "2026-07-21T12:00:20.000Z",
  sourceId: "11111111-1111-4111-8111-111111111111",
  trigger: "MANUAL" as const,
};

describe("source polling queues", () => {
  it("coalesces manual jobs deterministically without placing secrets in the payload", async () => {
    const add = vi.fn().mockResolvedValue({ id: "queue-job" });
    await expect(enqueueSourcePoll({ add }, data)).resolves.toEqual({
      id: "queue-job",
    });
    expect(add).toHaveBeenCalledWith("poll", data, {
      jobId: sourcePollJobId(data),
    });
    expect(JSON.stringify(add.mock.calls)).not.toMatch(
      /credential|password|secret|token/i,
    );
  });

  it("rejects malformed jobs at the worker boundary", () => {
    expect(() =>
      assertSourcePollJobData({ ...data, sourceId: "not-an-id" }),
    ).toThrow("Invalid source poll job");
  });

  it("coalesces one media scheduling attempt without preventing a later recache", async () => {
    const add = vi.fn().mockResolvedValue({});
    const mediaId = "22222222-2222-4222-8222-222222222222";
    const first = { mediaId, requestedAt: "2026-07-21T12:00:20.000Z" };
    const second = { mediaId, requestedAt: "2026-07-21T12:01:20.000Z" };
    await enqueueMediaCache({ add }, first);
    await enqueueMediaCache({ add }, second);
    expect(add.mock.calls[0]?.[2].jobId).not.toBe(add.mock.calls[1]?.[2].jobId);
    expect(add.mock.calls[0]?.[2].jobId).toContain(mediaId);
    expect(JSON.stringify(add.mock.calls)).not.toMatch(
      /url|credential|secret|token/i,
    );
  });

  it("queues only an internal content ID for bounded duplicate analysis", async () => {
    const add = vi.fn().mockResolvedValue({});
    const contentId = "33333333-3333-4333-8333-333333333333";
    await enqueueDuplicateDetection(
      { add },
      { contentId, requestedAt: "2026-07-21T12:00:20.000Z" },
    );
    expect(add.mock.calls[0]?.[2].jobId).toContain(contentId);
    expect(JSON.stringify(add.mock.calls)).not.toMatch(
      /url|credential|password|secret|token/i,
    );
    expect(() =>
      assertDuplicateDetectionJobData({
        contentId: "not-an-id",
        requestedAt: "not-a-date",
      }),
    ).toThrow("Invalid duplicate detection job");
  });
});
