import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentVerificationPanel } from "./payment-verification-panel";

describe("payment verification loading markup", () => {
  it("keeps the count skeleton valid inside its paragraph and emphasis", () => {
    const html = renderToStaticMarkup(<PaymentVerificationPanel branchId="" />);
    const count = html.match(/<p>Awaiting verification: <strong>([\s\S]*?)<\/strong><\/p>/)?.[1];

    expect(count).toBeDefined();
    expect(count).toMatch(/^<span\b/);
    expect(count).toContain('data-slot="skeleton"');
    expect(count).toContain('aria-hidden="true"');
    expect(count).not.toMatch(/<div\b/);
    expect(html).toContain('aria-busy="true"');
  });
});
