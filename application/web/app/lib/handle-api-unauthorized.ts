import {
  buildLoginRedirectUrl,
  isPublicRoute,
  isSafeReturnUrl,
} from "./route-access";

let isRedirectingToLogin = false;

type LoginRedirectLocation = Pick<Location, "pathname" | "search" | "replace">;

export function handleApiUnauthorized(
  status: number,
  location?: LoginRedirectLocation,
): void {
  const currentLocation =
    location ?? (typeof window === "undefined" ? undefined : window.location);

  if (
    status !== 401 ||
    !currentLocation ||
    currentLocation.pathname === "/login" ||
    isRedirectingToLogin
  ) {
    return;
  }

  const target = `${currentLocation.pathname}${currentLocation.search}`;
  if (!isSafeReturnUrl(target) || isPublicRoute(currentLocation.pathname)) {
    isRedirectingToLogin = true;
    currentLocation.replace(buildLoginRedirectUrl(null));
    return;
  }

  isRedirectingToLogin = true;
  currentLocation.replace(buildLoginRedirectUrl(target));
}
