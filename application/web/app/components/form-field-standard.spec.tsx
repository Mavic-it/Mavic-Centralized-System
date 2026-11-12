import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { FieldLabel } from "./field-label";

const tag = (n: ts.Node) =>
  (ts.isJsxElement(n)
    ? n.openingElement.tagName
    : ts.isJsxSelfClosingElement(n)
      ? n.tagName
      : undefined
  )?.getText();
const attribute = (n: ts.Node, key: string) => {
  const opening = ts.isJsxElement(n)
    ? n.openingElement
    : ts.isJsxSelfClosingElement(n)
      ? n
      : undefined;
  return opening?.attributes.properties.find(
    (a): a is ts.JsxAttribute =>
      ts.isJsxAttribute(a) && a.name.getText() === key,
  );
};
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith(".tsx") && !entry.name.includes(".spec.")
        ? [join(directory, entry.name)]
        : [],
  );

describe("global form field labels", () => {
  it("keeps label text intact, exposes the required indicator, and leaves optional labels unmarked", () => {
    const required = renderToStaticMarkup(
      <FieldLabel required>Work email</FieldLabel>,
    );
    expect(required).toContain("Work email");
    expect(required).toContain('aria-label="Required"');
    expect(required).toContain('class="required-mark"');
    const optional = renderToStaticMarkup(<FieldLabel>Middle name</FieldLabel>);
    expect(optional).not.toContain("required-mark");
    expect(optional).not.toContain("Optional");
    expect(
      renderToStaticMarkup(<FieldLabel required={false}>Message</FieldLabel>),
    ).not.toContain("required-mark");
  });

  it("provides a shared indicator for every native required control across all modules", () => {
    const missing: string[] = [];
    for (const file of files(join(process.cwd(), "app"))) {
      const source = readFileSync(file, "utf8"),
        tree = ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
      const labels: ts.JsxElement[] = [];
      const collect = (node: ts.Node) => {
        if (ts.isJsxElement(node) && tag(node) === "label") labels.push(node);
        ts.forEachChild(node, collect);
      };
      collect(tree);
      const visit = (node: ts.Node) => {
        if (
          ["input", "select", "textarea", "Input"].includes(tag(node) ?? "") &&
          attribute(node, "required")
        ) {
          let label: ts.Node | undefined = node.parent;
          while (label && !["label", "Field"].includes(tag(label) ?? ""))
            label = label.parent;
          if (!label) {
            const id = attribute(node, "id")?.initializer?.getText();
            label = id
              ? labels.find(
                  (item) =>
                    attribute(item, "htmlFor")?.initializer?.getText() === id,
                )
              : undefined;
          }
          const text = label?.getText() ?? "";
          if (
            !(
              tag(label ?? tree) === "Field" && attribute(label!, "required")
            ) &&
            !/RequiredMark|<FieldLabel\b[^>]*required|<ModalFieldLabel\s+required/.test(
              text,
            )
          )
            missing.push(
              `${file}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
            );
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect(missing).toEqual([]);
  });

  it("removes optional-label badges without changing optional policy choices or explanatory text", () => {
    const violations: string[] = [];
    for (const file of files(join(process.cwd(), "app"))) {
      const tree = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node, label = false) => {
        const name = tag(node);
        const inLabel =
          label ||
          ["label", "legend", "FieldLabel", "ModalFieldLabel"].includes(
            name ?? "",
          );
        if (
          inLabel &&
          ts.isJsxText(node) &&
          /\(optional\)|^\s*optional\s*$/i.test(node.getText())
        )
          violations.push(file);
        if (
          inLabel &&
          ts.isStringLiteral(node) &&
          /\(optional\)/i.test(node.text)
        )
          violations.push(file);
        if (["option", "small", "p"].includes(name ?? "")) return;
        ts.forEachChild(node, (child) => visit(child, inLabel));
      };
      visit(tree);
    }
    expect(violations).toEqual([]);
  });
});
