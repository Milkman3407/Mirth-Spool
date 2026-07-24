import { z } from "zod";

import type { Prisma } from "./generated/prisma/client.js";
import type { RepositoryClient } from "./repository-types.js";

const settingDefinitions = {
  "cache.policy": {
    defaultValue: "NONE",
    schema: z.enum(["NONE", "FAVORITES_ONLY", "TTL", "ALL_WITHIN_QUOTA"]),
  },
  "cache.allowedKinds": {
    defaultValue: ["IMAGE", "ANIMATED_IMAGE", "VIDEO"],
    schema: z
      .array(z.enum(["IMAGE", "ANIMATED_IMAGE", "VIDEO"]))
      .min(1)
      .max(3)
      .refine((value) => new Set(value).size === value.length),
  },
  "cache.maxObjectBytes": {
    defaultValue: 50_000_000,
    schema: z.number().int().min(1_000_000).max(500_000_000),
  },
  "cache.quotaBytes": {
    defaultValue: 1_000_000_000,
    schema: z.number().int().min(10_000_000).max(1_000_000_000_000),
  },
  "cache.ttlSeconds": {
    defaultValue: 604_800,
    schema: z.number().int().min(3_600).max(31_536_000),
  },
  "content.maximumRating": {
    defaultValue: "SAFE",
    schema: z.enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"]),
  },
  "feed.pageSize": {
    defaultValue: 40,
    schema: z.number().int().min(1).max(100),
  },
  "history.enabled": {
    defaultValue: true,
    schema: z.boolean(),
  },
  "recommendations.weights": {
    defaultValue: {
      favorite: 3,
      freshness: 0.8,
      hide: -4,
      media: 0.5,
      source: 1,
      sourcePriority: 0.25,
      tag: 0.75,
      view: 0.15,
    },
    schema: z
      .object({
        favorite: z.number().min(0).max(5),
        freshness: z.number().min(0).max(2),
        hide: z.number().min(-5).max(0),
        media: z.number().min(0).max(2),
        source: z.number().min(0).max(3),
        sourcePriority: z.number().min(0).max(1),
        tag: z.number().min(0).max(3),
        view: z.number().min(0).max(1),
      })
      .strict(),
  },
} as const;

export type SettingKey = keyof typeof settingDefinitions;
export type SettingValue<K extends SettingKey> = z.output<
  (typeof settingDefinitions)[K]["schema"]
>;

export function getSettingDefault<K extends SettingKey>(
  key: K,
): SettingValue<K> {
  const definition = settingDefinitions[key];
  return definition.schema.parse(definition.defaultValue) as SettingValue<K>;
}

export function validateSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): SettingValue<K> {
  return settingDefinitions[key].schema.parse(value) as SettingValue<K>;
}

export async function readSetting<K extends SettingKey>(
  client: RepositoryClient,
  key: K,
): Promise<SettingValue<K>> {
  const stored = await client.appSetting.findUnique({ where: { key } });
  return stored === null
    ? getSettingDefault(key)
    : validateSetting(key, stored.value);
}

export async function writeSetting<K extends SettingKey>(
  client: RepositoryClient,
  key: K,
  value: unknown,
): Promise<SettingValue<K>> {
  const parsed = validateSetting(key, value);
  await client.appSetting.upsert({
    where: { key },
    create: { key, value: parsed as Prisma.InputJsonValue },
    update: { value: parsed as Prisma.InputJsonValue, schemaVersion: 1 },
  });
  return parsed;
}

export const knownSettingKeys = Object.freeze(
  Object.keys(settingDefinitions) as SettingKey[],
);
