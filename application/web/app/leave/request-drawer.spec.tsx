import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RequestDrawer } from "./request-drawer";
import type { Context, Detail } from "./types";

vi.mock("../components/ui/confirmation-provider", () => ({
  useConfirmation: () => vi.fn(),
}));

const request = {
  id: "r-1",
  employeeId: "e-1",
  employeeName: "Test Employee",
  branchId: "b-1",
  branchName: "Makati",
  typeId: "t-1",
  typeName: "Vacation Leave",
  typeCode: "VL",
  creditYear: 2027,
  startDate: "2027-01-15",
  endDate: "2027-01-15",
  days: 1,
  halfDay: false,
  reason: "Vacation",
  status: "APPROVED",
  policy: { paid: true, allowApprovedCancellation: true },
  submittedAt: "2026-11-01T00:00:00Z",
  decidedAt: null,
  decisionComment: null,
  cancelledAt: null,
  cancellationReason: null,
  fileName: null,
} as Detail["request"];
const context = {
  userId: "u-1",
  ownEmployee: { id: "e-1", name: "Test Employee", branchId: "b-1" },
  canReview: false,
  canConfigure: false,
  globalScope: false,
  branches: [],
  employees: [],
} satisfies Context;

function render(detail: Detail, viewer: Context = context) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(["leave", "detail", "r-1"], detail);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RequestDrawer id="r-1" context={viewer} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Leave cancellation review drawer", () => {
  it("offers the employee three responses to a reviewer proposal", () => {
    const html = render({
      request,
      balance: null,
      events: [],
      canReview: false,
      cancellationReview: {
        id: "c-1",
        origin: "REVIEWER",
        status: "AWAITING_EMPLOYEE",
        reason: "Staffing",
        response: null,
        proposedStart: null,
        proposedEnd: null,
        createdAt: "2026-11-02T00:00:00Z",
      },
    });
    expect(html).toContain("Your response is needed");
    expect(html).toContain("Confirm cancellation");
    expect(html).toContain("Propose new dates");
    expect(html).toContain("Send response");
  });
  it("asks a reviewer to decide an employee cancellation without marking leave cancelled", () => {
    const html = render(
      {
        request,
        balance: null,
        events: [],
        canReview: false,
        cancellationReview: {
          id: "c-1",
          origin: "EMPLOYEE",
          status: "AWAITING_REVIEW",
          reason: "Plans changed",
          response: null,
          proposedStart: null,
          proposedEnd: null,
          createdAt: "2026-11-02T00:00:00Z",
        },
      },
      { ...context, userId: "admin", ownEmployee: null, canReview: true },
    );
    expect(html).toContain("Approve cancellation");
    expect(html).toContain("Decline change");
    expect(html).toContain("Plans changed");
    expect(html).toContain("Approved");
  });
});
