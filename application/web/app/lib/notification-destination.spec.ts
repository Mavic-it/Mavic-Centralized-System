import { describe, expect, it } from "vitest";
import { notificationDestination } from "./notification-destination";

describe("Notification destinations", () => {
  it("preserves specific record links", () => {
    expect(notificationDestination({ title: "Password reset requested", message: "Review request", href: "/system/password-reset-requests?requestId=reset-1" }, true)).toBe("/system/password-reset-requests?requestId=reset-1");
    expect(notificationDestination({ title: "Leave request updated", message: "Updated", href: null }, false)).toBe(null);
  });
  it("routes legacy alerts to their existing module or leave record", () => {
    expect(notificationDestination({ title: "Password reset requested", message: "Review" }, true)).toBe("/system/password-reset-requests");
    expect(notificationDestination({ title: "Leave request rejected", message: "Leave request leave-1 is now REJECTED." }, false)).toBe(null);
    expect(notificationDestination({ title: "Leave approved", message: "Your leave was approved." }, false)).toBe(null);
  });
  it("does not offer reset links to recipients without reset access", () => {
    expect(notificationDestination({ title: "Password reset requested", message: "Review", href: "/system/password-reset-requests?requestId=reset-1" }, false)).toBeNull();
  });
  it.each(["https://example.test", "//example.test", "javascript:alert(1)", "/\\example.test", "/ unsafe"])("rejects unsafe destination %s", (href) => {
    expect(notificationDestination({ title: "Notice", message: "Message", href }, true)).toBeNull();
  });
  it.each(["/leave","/leave/balances","/leave?requestId=record","/my-leave","/my-leave?requestId=record"])("preserves current leave destination %s",href=>{
    expect(notificationDestination({title:"Leave alert",message:"Open request",href},true)).toBe(href);
  });
  it("keeps notices without related content readable", () => {
    expect(notificationDestination({ title: "Information", message: "Welcome" }, false)).toBeNull();
  });
});
