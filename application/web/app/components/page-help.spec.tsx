import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHelp, pageGuides } from "./page-help";

describe("Workspace page guidance", () => {
  it("provides a closed help dialog trigger for every registered page", () => {
    for (const path of Object.keys(pageGuides)) {
      const html = renderToStaticMarkup(<PageHelp pathname={path} />);
      expect(html).toContain("How to use this page");
      expect(pageGuides[path]).toHaveLength(3);
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain("<details");
    }
  });
  it("supports employee details and omits unknown routes", () => {
    expect(
      renderToStaticMarkup(<PageHelp pathname="/employees/employee-123" />),
    ).toContain('aria-haspopup="dialog"');
    expect(renderToStaticMarkup(<PageHelp pathname="/unknown" />)).toBe("");
  });
});
