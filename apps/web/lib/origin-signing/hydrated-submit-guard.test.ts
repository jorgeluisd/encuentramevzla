import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCANNED_DIRS = ["app", "components"];
const MIN_ACTION_FORMS = 15;
const PUBLIC_FORM_FILES = [
  "components/search-panel.tsx",
  "components/servicios/submit-service-form.tsx",
  "components/servicios/report-service-button.tsx",
  "components/servicios/manage-service-form.tsx",
];

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

interface GuardReport {
  actionForms: number;
  violations: string[];
  formsWithoutNotice: string[];
}

function tagName(tag: JsxTag): string {
  return tag.tagName.getText();
}

function attribute(tag: JsxTag, name: string): ts.JsxAttribute | undefined {
  return tag.attributes.properties.find(
    (prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText() === name,
  );
}

const NATIVE_SUBMIT_INPUT_TYPES = new Set(["submit", "image"]);

function literalType(tag: JsxTag): string | undefined {
  const type = attribute(tag, "type");
  return type?.initializer !== undefined && ts.isStringLiteral(type.initializer) ? type.initializer.text : undefined;
}

function isLiteralButtonType(tag: JsxTag): boolean {
  return literalType(tag) === "button";
}

function nativeSubmitInputType(tag: JsxTag): string | undefined {
  const type = literalType(tag);
  return (tagName(tag) === "input" || tagName(tag) === "Input") && type !== undefined && NATIVE_SUBMIT_INPUT_TYPES.has(type)
    ? type
    : undefined;
}

function tagsIn(node: ts.Node): JsxTag[] {
  const found: JsxTag[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) found.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function openingOf(node: ts.JsxElement | ts.JsxSelfClosingElement): JsxTag {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function inspectSource(fileName: string, source: string): GuardReport {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report: GuardReport = { actionForms: 0, violations: [], formsWithoutNotice: [] };
  const at = (node: ts.Node): string => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${fileName}:${line + 1}:${character + 1}`;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = openingOf(node);
      const name = tagName(tag);
      if (name === "form" && attribute(tag, "action")) {
        report.actionForms += 1;
        const inner = ts.isJsxElement(node) ? tagsIn(node) : [];
        if (!inner.some((t) => tagName(t) === "HydratedSubmit")) {
          report.violations.push(`${at(tag)} <form action> without HydratedSubmit`);
        }
        for (const t of inner) {
          if ((tagName(t) === "button" || tagName(t) === "Button") && !isLiteralButtonType(t)) {
            report.violations.push(`${at(t)} <${tagName(t)}> inside <form action> must be type="button"`);
          }
          const inputType = nativeSubmitInputType(t);
          if (inputType) {
            report.violations.push(`${at(t)} <${tagName(t)} type="${inputType}"> inside <form action> submits before hydration`);
          }
        }
        if (!inner.some((t) => tagName(t) === "JsRequiredNotice")) {
          report.formsWithoutNotice.push(at(tag));
        }
      }
      if (attribute(tag, "formAction")) {
        if (name === "HydratedSubmit") report.actionForms += 1;
        else report.violations.push(`${at(tag)} formAction outside HydratedSubmit`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return report;
}

function tsxFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

function inspectFile(relativePath: string): GuardReport {
  return inspectSource(relativePath, readFileSync(join(WEB_ROOT, relativePath), "utf8"));
}

function inspectWebApp(): GuardReport {
  const files = SCANNED_DIRS.flatMap((dir) => tsxFilesUnder(join(WEB_ROOT, dir)));
  return files
    .map((file) => inspectFile(relative(WEB_ROOT, file)))
    .reduce<GuardReport>(
      (acc, r) => ({
        actionForms: acc.actionForms + r.actionForms,
        violations: [...acc.violations, ...r.violations],
        formsWithoutNotice: [...acc.formsWithoutNotice, ...r.formsWithoutNotice],
      }),
      { actionForms: 0, violations: [], formsWithoutNotice: [] },
    );
}

// Parsea todo app/ y components/ desde disco: en el disco externo del equipo tarda ~6 s y el
// límite por defecto de 5 s lo volvía intermitente.
const DISK_SCAN_TIMEOUT_MS = 30_000;

describe("hydrated submit guard (ADR-0012)", () => {
  it("routes every <form action> and formAction in app/ and components/ through HydratedSubmit (AC-13)", { timeout: DISK_SCAN_TIMEOUT_MS }, () => {
    const report = inspectWebApp();
    expect(report.violations).toEqual([]);
    expect(report.actionForms).toBeGreaterThanOrEqual(MIN_ACTION_FORMS);
  });

  it("puts a JsRequiredNotice inside every public <form action> (AC-14)", { timeout: DISK_SCAN_TIMEOUT_MS }, () => {
    const missing = PUBLIC_FORM_FILES.flatMap((file) => {
      const report = inspectFile(file);
      expect(report.actionForms, file).toBeGreaterThan(0);
      return report.formsWithoutNotice;
    });
    expect(missing).toEqual([]);
  });

  it("flags a <form action> whose submit is a plain Button, with file:line:col", () => {
    const source = [
      "export const F = () => (",
      "  <form action={act}>",
      '    <Button type="submit">Enviar</Button>',
      "  </form>",
      ");",
    ].join("\n");
    expect(inspectSource("inline.tsx", source).violations).toEqual([
      "inline.tsx:2:3 <form action> without HydratedSubmit",
      'inline.tsx:3:5 <Button> inside <form action> must be type="button"',
    ]);
  });

  it("treats a button without type inside <form action> as a submit", () => {
    const source = [
      "export const F = () => (",
      "  <form action={act}>",
      "    <HydratedSubmit>Enviar</HydratedSubmit>",
      "    <button onClick={toggle}>Más</button>",
      "  </form>",
      ");",
    ].join("\n");
    expect(inspectSource("inline.tsx", source).violations).toEqual([
      'inline.tsx:4:5 <button> inside <form action> must be type="button"',
    ]);
  });

  it("treats <input type=\"submit\"> and <input type=\"image\"> inside <form action> as native submits", () => {
    const source = [
      "export const F = () => (",
      "  <form action={act}>",
      '    <input type="submit" value="Enviar" />',
      '    <input type="image" src="/enviar.png" alt="Enviar" />',
      "    <HydratedSubmit>Enviar</HydratedSubmit>",
      '    <input type="text" name="q" />',
      "  </form>",
      ");",
    ].join("\n");
    expect(inspectSource("inline.tsx", source).violations).toEqual([
      'inline.tsx:3:5 <input type="submit"> inside <form action> submits before hydration',
      'inline.tsx:4:5 <input type="image"> inside <form action> submits before hydration',
    ]);
  });

  it("flags the shadcn Input as a native submit too, but not an input submit outside <form action>", () => {
    const source = [
      "export const F = () => (",
      "  <>",
      "    <form action={act}>",
      "      <HydratedSubmit>Enviar</HydratedSubmit>",
      '      <Input type="image" src="/enviar.png" alt="Enviar" />',
      "    </form>",
      "    <form onSubmit={handle}>",
      '      <input type="submit" value="Entrar" />',
      "    </form>",
      "  </>",
      ");",
    ].join("\n");
    expect(inspectSource("inline.tsx", source).violations).toEqual([
      'inline.tsx:5:7 <Input type="image"> inside <form action> submits before hydration',
    ]);
  });

  it("flags formAction on anything other than HydratedSubmit", () => {
    const source = [
      "export const F = () => (",
      "  <form>",
      '    <Button type="submit" formAction={act}>Ir</Button>',
      "  </form>",
      ");",
    ].join("\n");
    expect(inspectSource("inline.tsx", source).violations).toEqual([
      "inline.tsx:3:5 formAction outside HydratedSubmit",
    ]);
  });

  it("accepts HydratedSubmit plus type=\"button\" controls and counts formAction submits", () => {
    const source = [
      "export const F = () => (",
      "  <>",
      "    <form action={act}>",
      "      <HydratedSubmit>Enviar</HydratedSubmit>",
      '      <Button type="button" onClick={open}>Fusionar</Button>',
      "    </form>",
      "    <HydratedSubmit formAction={act}>Reasignar</HydratedSubmit>",
      "  </>",
      ");",
    ].join("\n");
    const report = inspectSource("inline.tsx", source);
    expect(report.violations).toEqual([]);
    expect(report.actionForms).toBe(2);
    expect(report.formsWithoutNotice).toEqual(["inline.tsx:3:5"]);
  });
});
