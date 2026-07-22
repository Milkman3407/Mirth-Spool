import { z } from "zod";

const forbiddenConfigKey =
  /authorization|cookie|credential|password|secret|token/i;

const managedSourceKindSchema = z.enum(["RSS", "LEMMY", "MASTODON", "REDDIT"]);

function secretPaths(
  value: unknown,
  path: readonly string[] = [],
): readonly (readonly string[])[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      secretPaths(entry, [...path, String(index)]),
    );
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    forbiddenConfigKey.test(key)
      ? [[...path, key]]
      : secretPaths(entry, [...path, key]),
  );
}

export const sourceConfigSchema = z
  .record(z.string().max(100), z.json())
  .superRefine((value, context) => {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16_384) {
      context.addIssue({
        code: "custom",
        message: "configuration is too large",
      });
    }
    for (const path of secretPaths(value)) {
      context.addIssue({
        code: "custom",
        message: "credentials must use the dedicated credential endpoint",
        path: [...path],
      });
    }
  });

const sourceFields = {
  config: sourceConfigSchema.default({}),
  defaultContentRating: z
    .enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"])
    .default("UNKNOWN"),
  displayName: z.string().trim().min(1).max(200),
  minimumScore: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .nullable()
    .default(null),
  pollIntervalSeconds: z.number().int().min(60).max(86_400).default(900),
  priority: z.number().int().min(-100).max(100).default(0),
} as const;

export const createSourceSchema = z
  .object({
    ...sourceFields,
    enabled: z.boolean().default(false),
    kind: managedSourceKindSchema,
  })
  .strict();

export const updateSourceSchema = z
  .object({
    config: sourceConfigSchema.optional(),
    defaultContentRating: z
      .enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"])
      .optional(),
    displayName: z.string().trim().min(1).max(200).optional(),
    minimumScore: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .nullable()
      .optional(),
    pollIntervalSeconds: z.number().int().min(60).max(86_400).optional(),
    priority: z.number().int().min(-100).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one mutable field is required",
  });

export const credentialInputSchema = z
  .object({
    kind: z.enum(["OAUTH_CLIENT", "ACCESS_TOKEN", "BASIC_AUTH", "CUSTOM"]),
    label: z.string().trim().min(1).max(100),
    payload: z.record(z.string().max(100), z.json()),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.payload).length > 50) {
      context.addIssue({
        code: "custom",
        message: "credential payload has too many fields",
      });
    }
    if (Buffer.byteLength(JSON.stringify(value.payload), "utf8") > 16_384) {
      context.addIssue({
        code: "custom",
        message: "credential payload is too large",
      });
    }
  });

export const sourceIdSchema = z.uuid();

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type CredentialInput = z.infer<typeof credentialInputSchema>;
