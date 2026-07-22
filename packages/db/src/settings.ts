import { z } from "zod";

import type { Prisma } from "./generated/prisma/client.js";
import type { RepositoryClient } from "./repository-types.js";

const settingDefinitions = {
  "cache.policy": {
    defaultValue: "NONE",
    schema: z.enum(["NONE", "FAVORITES_ONLY", "TTL", "ALL_WITHIN_QUOTA"]),
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
