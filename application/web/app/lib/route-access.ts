const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

export function isPublicRoute(pathname: string): boolean {
  const normalized = pathname.split("?")[0].split("#")[0];

  if (PUBLIC_PATHS.has(normalized)) {
    return true;
  }

  return normalized === "/" || normalized.startsWith("/api/");
}

export function isSafeReturnUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return null;
  }

  if (!trimmed.startsWith("/")) {
    return null;
  }

  return trimmed;
}

export function buildLoginRedirectUrl(
  value: string | null | undefined,
): string {
  const safeValue = isSafeReturnUrl(value);

  if (!safeValue) {
    return "/login";
  }

  const params = new URLSearchParams({ returnUrl: safeValue });
  return `/login?${params.toString()}`;
}
