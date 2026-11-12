export type NotificationDestination = {
  title: string;
  message: string;
  href?: string | null;
};

export function notificationDestination(alert: NotificationDestination, canReviewResets: boolean): string | null {
  let href = alert.href;
  if (!href && alert.title === "Password reset requested") href = "/system/password-reset-requests";
  if (!href || !href.startsWith("/") || href.startsWith("//") || /[\\\s]/.test(href)) return null;
  if (href.split("?")[0] === "/system/password-reset-requests" && !canReviewResets) return null;
  return href;
}
