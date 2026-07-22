export function safeReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  return value.slice(0, 1_024);
}

export function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === "/api/health/live" ||
    pathname === "/api/health/ready" ||
    pathname === "/api/setup/status" ||
    pathname === "/api/setup" ||
    pathname.startsWith("/api/auth/")
  );
}
