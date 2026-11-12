import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Modal } from "./ui/modal";

describe("modal stacking", () => {
  it("uses a named native modal shell for browser top-layer presentation", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Modal,
        {
          "aria-labelledby": "test-title",
          busy: true,
          onClose: () => undefined,
        },
        createElement("h2", { id: "test-title" }, "Edit branch"),
      ),
    );
    expect(markup).toMatch(/^<dialog\b/);
    expect(markup).toContain('aria-labelledby="test-title"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('class="app-modal ');
    // The client opens it with showModal(), rather than an unisolated open attribute.
    expect(markup).not.toMatch(/\sopen(?:=|\s|>)/);
  });
});
