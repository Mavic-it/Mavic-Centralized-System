import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenStreetMapLocationPicker } from "./openstreetmap-location-picker";

describe("OpenStreetMapLocationPicker form semantics", () => {
  it("does not add a nested form when rendered inside the branch form", () => {
    const markup = renderToStaticMarkup(
      <form>
        <OpenStreetMapLocationPicker
          value={{ address: "", city: "", province: "", postalCode: "", latitude: null, longitude: null }}
          onSelect={() => undefined}
        />
      </form>,
    );

    expect(markup.match(/<form(?=[\s>])/g)).toHaveLength(1);
    expect(markup).toContain('role="search"');
  });
});
