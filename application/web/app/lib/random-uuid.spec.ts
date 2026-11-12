import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "./random-uuid";

afterEach(() => vi.unstubAllGlobals());

describe("randomUuid", () => {
  it("uses native randomUUID when available", () => {
    const native = vi.fn(() => "native-uuid");
    vi.stubGlobal("crypto", { randomUUID: native });
    expect(randomUuid()).toBe("native-uuid");
    expect(native).toHaveBeenCalledOnce();
  });

  it("generates distinct version 4 UUIDs when randomUUID is unavailable on HTTP", () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 100 }, () => randomUuid());
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
