export const AUTH_JSON_MAX_BYTES = 4 * 1024;
export class RequestTooLargeError extends Error {
  constructor() {
    super("The request body is too large.");
    this.name = "RequestTooLargeError";
  }
}

export async function readBoundedJson(
  request: Request,
  options: { readonly maxBytes: number; readonly requestId: string },
): Promise<{ readonly value: unknown } | { readonly response: Response }>;
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown>;
export async function readBoundedJson(
  request: Request,
  options: number | { readonly maxBytes: number; readonly requestId: string },
): Promise<unknown> {
  const maxBytes = typeof options === "number" ? options : options.maxBytes;
  try {
    const value = await readBoundedJsonValue(request, maxBytes);
    return typeof options === "number" ? value : { value };
  } catch (error) {
    if (typeof options === "number") throw error;
    const tooLarge = error instanceof RequestTooLargeError;
    return {
      response: Response.json(
        {
          error: {
            code: tooLarge ? "REQUEST_TOO_LARGE" : "VALIDATION_FAILED",
            message: tooLarge
              ? "The request body is too large."
              : "The request body is invalid.",
            requestId: options.requestId,
          },
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8",
            "X-Request-Id": options.requestId,
          },
          status: tooLarge ? 413 : 400,
        },
      ),
    };
  }
}

async function readBoundedJsonValue(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (/^\d+$/u.test(declaredLength) === false ||
      Number(declaredLength) > maxBytes)
  ) {
    throw new RequestTooLargeError();
  }

  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new RequestTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}
