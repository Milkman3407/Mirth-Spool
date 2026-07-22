export const CSRF_REJECTED_CODE = "CSRF_REJECTED" as const;

export function isSameOriginJsonMutation(
  request: Request,
  publicOrigin: string,
): boolean {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim();
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    contentType === "application/json" &&
    origin === publicOrigin &&
    fetchSite !== "cross-site"
  );
}
