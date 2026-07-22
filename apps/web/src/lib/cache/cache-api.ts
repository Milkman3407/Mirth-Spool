import { apiError } from "../api-response";
import { consumeRateLimit, hashRateLimitSubject } from "../auth/rate-limit";
import { getAuthServices } from "../auth/server";
import { getCacheServices } from "./server";

export async function enforceCacheMutationRateLimit(
  userId: string,
  requestId: string,
): Promise<Response | null> {
  const services = getCacheServices();
  const key = hashRateLimitSubject(
    getAuthServices().authConfig.secret,
    "cache-mutation",
    userId,
  );
  const decision = await consumeRateLimit(services.mutationRateLimitStore, {
    key,
    limit: 10,
    windowSeconds: 60,
  });
  return decision.allowed
    ? null
    : apiError("CACHE_RATE_LIMITED", "Too many cache requests.", {
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
        requestId,
        status: 429,
      });
}
