export interface SafeAuthenticationError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

export function mapAuthenticationError(
  status: number,
): SafeAuthenticationError {
  if (status === 403) {
    return Object.freeze({
      code: "CSRF_REJECTED",
      message: "The request could not be verified.",
      status: 403,
    });
  }
  if (status === 429) {
    return Object.freeze({
      code: "AUTH_RATE_LIMITED",
      message: "Too many authentication attempts. Try again later.",
      status: 429,
    });
  }
  if (status >= 400 && status < 500) {
    return Object.freeze({
      code: "AUTHENTICATION_FAILED",
      message: "The supplied credentials were not accepted.",
      status: 401,
    });
  }
  return Object.freeze({
    code: "AUTHENTICATION_UNAVAILABLE",
    message: "Authentication is temporarily unavailable.",
    status: 503,
  });
}
