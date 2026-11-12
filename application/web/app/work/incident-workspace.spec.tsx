import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailOverview } from "./detail-overview";
import { IncidentWorkspace } from "./incident-workspace";
import type { Detail } from "./types";

const detail: Detail = {
  id: "incident-1",
  title: "Private report",
  description: "Report narrative.",
  remarks: "Additional report detail.",
  employeeId: "employee-1",
  employeeName: "Employee One",
  branchName: "Mspaces Makati",
  status: "UNDER_REVIEW",
  version: 2,
  canManage: true,
  isAssignee: false,
  isReporter: false,
  isSubject: false,
  canAssignReviewer: true,
  canResolve: true,
  canInitiateCase: true,
  events: [
    {
      id: "event-1",
      action: "REVIEW",
      audience: "INTERNAL",
      message: "Internal review note.",
      createdAt: "2026-10-29T09:00:00.000Z",
      actor: "HR reviewer",
    },
  ],
  attachments: [
    {
      id: "file-1",
      eventId: "event-1",
      filename: "review.pdf",
      mime: "application/pdf",
    },
  ],
  incidentDate: "2026-10-28",
  category: "CONDUCT",
  referenceNumber: "INC-123",
};

describe("private incident workspace", () => {
  it("combines report, next action, private history, and evidence in one view", () => {
    const html = renderToStaticMarkup(
      <IncidentWorkspace
        detail={detail}
        available={["COMMENT", "REQUEST_DETAILS"]}
        currentAction="COMMENT"
        employees={[]}
        branches={[]}
        reviewers={[]}
        audience="INTERNAL"
        busy={false}
        progress={null}
        onAction={vi.fn()}
        onAudience={vi.fn()}
        onProgress={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    for (const text of [
      "What happened",
      "Additional report detail.",
      "Next step",
      "View report history",
      "Internal review note.",
      "Case reviewers only",
      "Add a supporting file",
      "review.pdf",
    ])
      expect(html).toContain(text);
    expect(html.match(/attachments\/file-1/g)).toHaveLength(1);
    expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).not.toContain("(optional)");
    expect(html).not.toContain("Assigned reviewer");
    expect(html).not.toContain("Last updated");
    expect(html).not.toContain("Additional remarks");
    expect(html).not.toContain("Overview");
    expect(html).not.toContain("Activity</button>");
    expect(html).not.toContain("Files</button>");
    expect(html).not.toContain("Update</button>");
    expect(html).not.toContain("Start review</button>");
  });

  it("keeps closed case history and files available without upload or action forms", () => {
    const html = renderToStaticMarkup(
      <IncidentWorkspace
        detail={{ ...detail, status: "CLOSED", availableActions: undefined } as Detail}
        available={[]}
        currentAction=""
        employees={[]}
        branches={[]}
        reviewers={[]}
        audience="INTERNAL"
        busy={false}
        progress={null}
        onAction={vi.fn()}
        onAudience={vi.fn()}
        onProgress={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain("Internal review note.");
    expect(html).toContain("review.pdf");
    expect(html).not.toContain("Next step");
    expect(html).not.toContain("Add a supporting file");
    expect(html.match(/type="file"/g)).toBeNull();
  });
});


describe("incident reference display", () => {
  it("does not fall back to the internal UUID when the reference is missing", () => {
    const id = "12345678-1234-4234-8234-123456789abc";
    const html = renderToStaticMarkup(<DetailOverview kind="incidents" detail={{ ...detail, id, referenceNumber: undefined }} />);
    expect(html).not.toContain(id);
    expect(html).toContain("Not available");
  });
  it("keeps the readable incident reference", () => {
    const html = renderToStaticMarkup(<DetailOverview kind="incidents" detail={{ ...detail, referenceNumber: "INC-2026-001" }} />);
    expect(html).toContain("INC-2026-001");
  });
});
