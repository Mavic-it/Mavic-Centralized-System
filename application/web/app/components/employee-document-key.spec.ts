import { describe, expect, it } from "vitest";
import { employeeDocumentKey } from "./employee-document-key";

describe("employeeDocumentKey", () => {
  it("keeps rows unique when an employee has duplicate document names", () => {
    const employeeId = "employee-1";
    const documents = [
      "GCASH Qr Code layout (1).pdf",
      "GCASH Qr Code layout (1).pdf",
    ];

    const keys = documents.map((_, index) => employeeDocumentKey(employeeId, index));

    expect(keys).toEqual([
      "employee-1:document:0",
      "employee-1:document:1",
    ]);
    expect(new Set(keys).size).toBe(documents.length);
  });
});
