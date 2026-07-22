import { apiError } from "./api-response";

export async function readBoundedJson(
  request: Request,
  options: { readonly maxBytes: number; readonly requestId: string },
): Promise<{ readonly value: unknown } | { readonly response: Response }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    return {
      response: apiError(
        "REQUEST_TOO_LARGE",
        "The request body is too large.",
        {
          requestId: options.requestId,
          status: 413,
        },
      ),
    };
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return {
      response: apiError(
        "VALIDATION_FAILED",
        "A JSON request body is required.",
        {
          requestId: options.requestId,
          status: 400,
        },
      ),
    };
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > options.maxBytes) {
        await reader.cancel();
        return {
          response: apiError(
            "REQUEST_TOO_LARGE",
            "The request body is too large.",
            {
              requestId: options.requestId,
              status: 413,
            },
          ),
        };
      }
      chunks.push(result.value);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, bytes),
    );
    return { value: JSON.parse(text) };
  } catch {
    return {
      response: apiError(
        "VALIDATION_FAILED",
        "The JSON request body is invalid.",
        {
          requestId: options.requestId,
          status: 400,
        },
      ),
    };
  }
}
