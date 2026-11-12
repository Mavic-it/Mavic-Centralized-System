import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialogProvider } from "../../components/ui/confirmation-provider";
import { ObRequestForm } from "./request-form";
import { ObAttendancePreview } from "./attendance-preview";
import { ScheduleObBadge } from "../../components/schedule-ob-badge";
describe("Official Business UI", () => {
  it("files a dated interval with required business reason and automatic overnight handling", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DialogProvider>
          <ObRequestForm
            context={{
              ownEmployee: { id: "employee", name: "Employee" },
              canReview: false,
              canFile: true,
              employees: [],
              branches: [],
            }}
            onClose={vi.fn()}
            onSaved={vi.fn()}
          />
        </DialogProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("OB start date");
    expect(html).toContain("OB end date");
    expect(html).toContain("Estimated start");
    expect(html).toContain("Estimated end");
    expect(html).not.toContain("End is on the next day");
    expect(html).toContain("following morning");
    expect(html).toContain("Business purpose / reason");
    expect(html).not.toContain("Past-date filing");
    expect(html).not.toContain("Retrospective filing explanation");
    expect(html).toContain("Preview attendance");
    expect(html).not.toContain("Choose employee");
  });
  it("distinguishes approved credit from missing actual punches", () => {
    const html = renderToStaticMarkup(
      <ObAttendancePreview
        calculation={{
          actualIn: null,
          actualOut: null,
          workedMinutes: 480,
          obCreditedMinutes: 480,
          exceptions: [],
          statuses: ["OB"],
          payrollReady: true,
          schedule: {
            shiftStart: "09:00",
            shiftEnd: "18:00",
            breakMinutes: 60,
          },
        }}
      />,
    );
    expect(html.match(/No punch/g)).toHaveLength(2);
    expect(html).toContain("Approved OB credit");
    expect(html).toContain("480");
    expect(html).toContain("biometric punches remain unchanged");
  });
  it("shows pending and approved schedule badges with request links", () => {
    const html = renderToStaticMarkup(
      <ScheduleObBadge
        requests={[
          { id: "one", status: "PENDING", destination: "Client" },
          {
            id: "two",
            status: "APPROVED",
            destination: "Ortigas",
            cancellationPending: true,
          },
        ]}
      />,
    );
    expect(html).toContain("OB pending");
    expect(html).toContain("OB approved");
    expect(html).toContain("Cancellation pending");
    expect(html).toContain("/attendance/official-business?obId=two");
  });
});
