import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordCollection } from "./record-collection";
import { workTimestamp } from "./presentation";
vi.mock("../lib/use-remembered-view", () => ({
  CARD_TABLE_VIEWS: ["cards", "table"],
  useRememberedView: () => ["table", vi.fn()],
}));

describe("incident table timestamps", () => {
  it("matches all seven headers with cells and keeps Open after both timestamps", () => {
    const createdAt = "2026-11-06T18:30:00.000Z";
    const updatedAt = "2026-11-07T04:15:00.000Z";
    const html = renderToStaticMarkup(<RecordCollection kind="incidents" items={[{id:"incident-1",title:"Report",description:"Report summary",employeeId:"",status:"SUBMITTED",version:1,branchName:"Makati",createdAt,updatedAt}]} status="" statuses={["SUBMITTED"]} onStatus={vi.fn()} loading={false} busy={false} onRefresh={vi.fn()} onOpen={vi.fn()} />);
    const row = html.match(/<tbody>(.*?)<\/tbody>/)![1];
    expect(html.match(/<th>/g)).toHaveLength(7);
    expect(row.match(/<td(?:\s|>)/g)).toHaveLength(7);
    expect(row).toContain(`<td>${workTimestamp(createdAt)}</td><td>${workTimestamp(updatedAt)}</td><td><button`);
    expect(workTimestamp(createdAt)).toContain("Nov 7, 2026");
  });
  it("shows a readable fallback for absent or invalid timestamps", () => {
    expect(workTimestamp()).toBe("Not available");
    expect(workTimestamp("invalid")).toBe("Not available");
  });
});
