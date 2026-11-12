import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WorkspaceNotifications,
  notificationTime,
} from "./workspace-notifications";

describe("Notification inbox presentation", () => {
  it("uses a nonmodal native popover with persistent history and accessible filters", () => {
    const html = renderToStaticMarkup(
      <WorkspaceNotifications canReviewResets={false} />,
    );
    expect(html).toContain('popover="auto"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Your updates from the last 60 days");
    expect(html).toContain("Mark all read");
    expect(html).not.toContain('aria-modal="true"');
  });
  it("formats relative times across minute/hour/day boundaries", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(notificationTime("2026-10-23T11:59:45Z", now)).toBe("Just now");
    expect(notificationTime("2026-10-23T11:58:00Z", now)).toBe("2m ago");
    expect(notificationTime("2026-10-23T09:00:00Z", now)).toBe("3h ago");
    expect(notificationTime("2026-08-25T12:00:00Z", now)).toBe("59d ago");
  });
});
