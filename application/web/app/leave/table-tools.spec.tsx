import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableTools } from "./table-tools";

describe("Leave table tools", () => {
  it("labels page-scoped search and exposes sort and result feedback", () => {
    const html = renderToStaticMarkup(<TableTools search="sick" onSearch={() => {}} sort="newest" onSort={() => {}} sortOptions={[{ value: "newest", label: "Newest submitted" }]} count={2} label="requests" pageOnly />);
    expect(html).toContain("Search this page");
    expect(html).toContain("Newest submitted");
    expect(html).toContain("2 shown on this page");
    expect(html).toContain("Clear search");
    expect(html).toContain('role="status"');
  });
});
