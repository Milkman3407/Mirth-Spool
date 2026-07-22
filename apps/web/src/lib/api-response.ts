import { randomUUID } from "node:crypto";

const responseHeaders = (requestId: string): Record<string, string> => ({
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Request-Id": requestId,
});

export function requestIdFrom(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9_-]{8,80}$/u.test(supplied)
    ? supplied
    : `req_${randomUUID()}`;
}

export function apiJson(
  body: unknown,
  options: { readonly requestId: string; readonly status?: number },
): Response {
  return Response.json(body, {
    headers: responseHeaders(options.requestId),
    status: options.status ?? 200,
  });
}

export function apiError(
  code: string,
  message: string,
  options: {
    readonly headers?: Readonly<Record<string, string>>;
    readonly requestId: string;
    readonly status: number;
  },
): Response {
  const headers = new Headers(responseHeaders(options.requestId));
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  return Response.json(
    { error: { code, message, requestId: options.requestId } },
    { headers, status: options.status },
  );
}
