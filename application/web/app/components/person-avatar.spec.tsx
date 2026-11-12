import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonAvatar } from "./person-avatar";

describe("person avatar", () => {
  it("uses the protected employee picture and encodes the photo version", () => {
    const html = renderToStaticMarkup(
      <PersonAvatar
        employeeId="employee-1"
        name="Carlyn Vergara"
        profilePictureUpdatedAt="2026-10-30T00:00:00Z&v=2"
      />,
    );
    expect(html).toContain(
      "/api/employees/employee-1/profile-picture?v=2026-10-30T00%3A00%3A00Z%26v%3D2",
    );
    expect(html).not.toContain(">CV<");
  });

  it("shows initials when a linked photo is unavailable", () => {
    const html = renderToStaticMarkup(
      <PersonAvatar employeeId="employee-1" name="Carlyn Vergara" />,
    );
    expect(html).toContain(">CV</span>");
    expect(html).not.toContain("<img");
  });
});
