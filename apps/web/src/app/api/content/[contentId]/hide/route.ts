import { mutateContentAction } from "../../../../../lib/actions/action-route";

type Context = { readonly params: Promise<{ readonly contentId: string }> };

export function PUT(request: Request, context: Context) {
  return mutateContentAction(request, context, {
    enabled: true,
    kind: "HIDE",
  });
}

export function DELETE(request: Request, context: Context) {
  return mutateContentAction(request, context, {
    enabled: false,
    kind: "HIDE",
  });
}
