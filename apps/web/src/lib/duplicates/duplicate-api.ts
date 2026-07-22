import { apiError } from "../api-response";
import { consumeRateLimit, hashRateLimitSubject } from "../auth/rate-limit";
import { getDuplicateServices } from "./server";

export async function enforceDuplicateMutationRateLimit(
  userId: string,
  requestId: string,
): Promise<Response | null> {
  const services = getDuplicateServices();
  const decision = await consumeRateLimit(services.mutationRateLimitStore, {
    key: hashRateLimitSubject(services.secret, "duplicate-mutation", userId),
    limit: 20,
    windowSeconds: 60,
  });
  return decision.allowed
    ? null
    : apiError(
        "DUPLICATE_RATE_LIMITED",
        "Too many duplicate-management requests.",
        {
          headers: { "Retry-After": String(decision.retryAfterSeconds) },
          requestId,
          status: 429,
        },
      );
}
