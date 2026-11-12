import { useQueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MyProfileQueryProvider from "./my-profile-query-provider";

function QueryClientConsumer() {
  useQueryClient();
  return <span>Query client is available</span>;
}

describe("MyProfileQueryProvider", () => {
  it("provides a QueryClient to My Profile descendants", () => {
    const markup = renderToStaticMarkup(
      <MyProfileQueryProvider>
        <QueryClientConsumer />
      </MyProfileQueryProvider>,
    );

    expect(markup).toContain("Query client is available");
  });
});
