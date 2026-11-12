import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Modal } from "./modal";
import { BranchDeleteDialog } from "../../branches/components/branch-delete-dialog";
describe("Shared modal presentation", () => {
  it("defaults information/forms to a modal right panel while retaining busy semantics", () => {
    const html = renderToStaticMarkup(
      <Modal onClose={() => {}} busy aria-labelledby="title">
        <h2 id="title">Edit record</h2>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(html).toContain('data-presentation="drawer"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-busy="true"');
  });
  it("supports explicit centered confirmations without changing dialog content", () => {
    const html = renderToStaticMarkup(
      <Modal onClose={() => {}} presentation="center" role="alertdialog">
        <p>Confirm change?</p>
      </Modal>,
    );
    expect(html).toContain('data-presentation="center"');
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Confirm change?");
  });
  it("keeps confirmations that require input in a side panel", () => {
    const html = renderToStaticMarkup(<BranchDeleteDialog branchName="Test branch" password="" isPending={false} onPasswordChange={() => {}} onClose={() => {}} onSubmit={event => event.preventDefault()} />);
    expect(html).toContain('type="password"');
    expect(html).toContain('data-presentation="drawer"');
  });

});
