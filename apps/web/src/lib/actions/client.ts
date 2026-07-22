import { z } from "zod";

export const actionStateSchema = z.object({
  favorite: z.boolean(),
  hidden: z.boolean(),
  viewed: z.boolean(),
  view: z
    .object({
      count: z.number().int().positive(),
      firstViewedAt: z.iso.datetime({ offset: true }),
      lastViewedAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});

const actionResponseSchema = z.object({
  actionState: actionStateSchema,
  contentId: z.uuid(),
});

export type ActionState = z.infer<typeof actionStateSchema>;
export type MutableActionKind = "favorite" | "hide";

export async function mutateContentAction(
  contentId: string,
  kind: MutableActionKind | "view",
  enabled = true,
): Promise<ActionState> {
  const response = await fetch(`/api/content/${contentId}/${kind}`, {
    body: "{}",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: enabled ? "PUT" : "DELETE",
  });
  if (!response.ok) throw new Error("ACTION_REQUEST_FAILED");
  return actionResponseSchema.parse(await response.json()).actionState;
}
