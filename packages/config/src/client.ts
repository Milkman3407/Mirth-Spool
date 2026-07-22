import { z } from "zod";

const httpOriginSchema = z
  .url("must be an absolute URL")
  .max(2_048, "must be at most 2048 characters")
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "must use http or https")
  .transform((value) => new URL(value).origin);

const clientEnvironmentSchema = z.object({
  MIRTHSPOOL_PUBLIC_ORIGIN: httpOriginSchema,
});

export interface ClientConfig {
  readonly publicOrigin: string;
}

export function parseClientConfig(environment: unknown): ClientConfig {
  const parsed = clientEnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Invalid client configuration: ${fields.join(", ")}`);
  }

  return Object.freeze({
    publicOrigin: parsed.data.MIRTHSPOOL_PUBLIC_ORIGIN,
  });
}
