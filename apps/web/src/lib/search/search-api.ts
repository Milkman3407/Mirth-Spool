import { apiError } from "../api-response";
import { consumeRateLimit, hashRateLimitSubject } from "../auth/rate-limit";
import { getSearchServices } from "./server";

export async function enforceSearchRateLimit(
  userId: string,
  requestId: string,
): Promise<Response | null> {
  const services = getSearchServices();
  const decision = await consumeRateLimit(services.rateLimitStore, {
    key: hashRateLimitSubject(services.secret, "search", userId),
    limit: 60,
    windowSeconds: 60,
  });
  return decision.allowed
    ? null
    : apiError("SEARCH_RATE_LIMITED", "Too many search requests.", {
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
        requestId,
        status: 429,
      });
}
