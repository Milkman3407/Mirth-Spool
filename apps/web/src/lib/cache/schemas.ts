import { z } from "zod";

export const cacheSettingsSchema = z
  .object({
    allowedKinds: z
      .array(z.enum(["IMAGE", "ANIMATED_IMAGE", "VIDEO"]))
      .min(1)
      .max(3)
      .refine((value) => new Set(value).size === value.length),
    maxObjectBytes: z.number().int().min(1_000_000).max(500_000_000),
    policy: z.enum(["NONE", "FAVORITES_ONLY", "TTL", "ALL_WITHIN_QUOTA"]),
    quotaBytes: z.number().int().min(10_000_000).max(1_000_000_000_000),
    ttlSeconds: z.number().int().min(3_600).max(31_536_000),
  })
  .strict()
  .refine((value) => value.maxObjectBytes <= value.quotaBytes, {
    message: "The per-object limit must not exceed the total quota.",
    path: ["maxObjectBytes"],
  });

export const cachePurgeSchema = z
  .object({ confirmation: z.literal("PURGE CACHE") })
  .strict();

export const emptyCacheMutationSchema = z.object({}).strict();
