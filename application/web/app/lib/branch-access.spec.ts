import { afterEach, describe, expect, it, vi } from "vitest";
import { loadActiveBranches, loadWorkspaceBranchAccess } from "./branch-access";

afterEach(() => vi.unstubAllGlobals());
describe("branch choices and current selection", () => {
  it("loads every active branch page without changing the session filter", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Branch ${i}` })), meta: { total: 101, pageSize: 100 } }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "last", name: "Last branch" }], meta: { total: 101, pageSize: 100 } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadActiveBranches()).toHaveLength(101);
    expect(fetcher.mock.calls[1][0]).toContain("page=2");
  });
  it("loads the complete database-authorized scope without posting a selection", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ canSwitch: true, branches: [{ id: "a", name: "A" }, { id: "b", name: "B" }], selectedBranchIds: ["a", "b"], allBranches: true }));
    vi.stubGlobal("fetch", fetcher);
    const access = await loadWorkspaceBranchAccess();
    expect(access.branches.map(branch => branch.id)).toEqual(["a", "b"]);
    expect(access.selectedBranchIds).toEqual(["a", "b"]);
    expect(access.allBranches).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
  });
});
