import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

/** The script generated projects run; it lives in the template because that is what they receive. */
const scan = path.join(
  import.meta.dirname,
  "../templates/governance/scripts/scan.mjs"
);

const row = z.object({
  complexity: z.number(),
  coverage: z.number(),
  crap: z.number(),
  name: z.string(),
  path: z.string(),
});

const side = z.object({ file: z.string(), startLine: z.number() });

const report = z.object({
  duplicates: z.array(z.object({ left: side, right: side, score: z.number() })),
  rows: z.array(row),
});

/** Runs the script as a project runs it, against a throwaway tree this test owns. */
const runScan = (
  files: Record<string, string>,
  coverage: string
): z.infer<typeof report> => {
  const root = mkdtempSync(path.join(tmpdir(), "vibestart-scan-"));
  writeFileSync(
    path.join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n"
  );
  writeFileSync(
    path.join(root, "package.json"),
    '{ "name": "scan-fixture", "private": true }\n'
  );

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  // The script reads the workspace list, and a workspace is a directory with a manifest.
  const workspaces = new Set(
    Object.keys(files)
      .filter(
        (file) => file.startsWith("packages/") || file.startsWith("apps/")
      )
      .map((file) => file.split("/").slice(0, 2).join("/"))
  );

  for (const workspace of workspaces) {
    const manifest = path.join(root, workspace, "package.json");
    mkdirSync(path.dirname(manifest), { recursive: true });
    writeFileSync(
      manifest,
      `{ "name": "@scan/${workspace.split("/")[1]}", "private": true }\n`
    );
  }

  if (coverage !== "") {
    const target = path.join(root, "coverage/lcov.info");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, coverage);
  }

  return report.parse(
    JSON.parse(
      execFileSync(process.execPath, [scan, "--root", root, "--json"], {
        encoding: "utf-8",
      })
    )
  );
};

/** Two functions with the same calls and operators, differing only in names and literals. */
const twin = (name: string, field: string, size: string) =>
  [
    `export function ${name}(input: Record<string, unknown>) {`,
    "  const items = Object.keys(input).filter((key) => input[key] !== undefined);",
    `  return items.map((key) => ({ ${field}: key, size: ${size} }));`,
    "}",
    "",
  ].join("\n");

describe("the scan script generated projects run", () => {
  it("counts decisions as 1 + if, loops, catch, ternary, case, &&, ||, ?? and ?.", () => {
    const result = runScan(
      {
        "packages/app/src/pick.ts": [
          "export function pick(value: number) {",
          "  if (value > 1 && value < 3) {",
          "    return value ? 1 : 2;",
          "  }",
          "  try {",
          "    return value ?? 0;",
          "  } catch {",
          "    return 0;",
          "  }",
          "}",
          "",
        ].join("\n"),
      },
      ""
    );

    // 1 + if + && + ternary + catch + ?? = 6
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ complexity: 6, name: "pick" });
  });

  it("scores a function the coverage report never mentions as 0% and CRAP at CC²+CC", () => {
    const result = runScan(
      {
        "packages/app/src/pick.ts": [
          "export function pick(value: number) {",
          "  if (value) {",
          "    return 1;",
          "  }",
          "  return 0;",
          "}",
          "",
        ].join("\n"),
      },
      ""
    );

    expect(result.rows[0]).toMatchObject({
      complexity: 2,
      coverage: 0,
      crap: 6,
    });
  });

  it("reads a function's range from LCOV and scores fully covered lines at 100%", () => {
    const result = runScan(
      {
        "packages/app/src/pick.ts": [
          "export function pick(value: number) {",
          "  if (value) {",
          "    return 1;",
          "  }",
          "  return 0;",
          "}",
          "",
        ].join("\n"),
      },
      [
        "SF:packages/app/src/pick.ts",
        "DA:1,1",
        "DA:2,1",
        "DA:3,1",
        "DA:5,1",
        "DA:6,1",
        "end_of_record",
        "",
      ].join("\n")
    );

    expect(result.rows[0]).toMatchObject({
      complexity: 2,
      coverage: 100,
      crap: 2,
    });
  });

  it("pairs two functions that differ only in local names, field names and literals", () => {
    const result = runScan(
      {
        "packages/app/src/left.ts": twin("left", "name", "1"),
        "packages/app/src/right.ts": twin("right", "label", "2"),
      },
      ""
    );

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.score).toBe(1);
  });

  it("parses `.mjs` files with their own grammar rather than the TSX one", () => {
    const result = runScan(
      {
        "scripts/tool.mjs": [
          "export const run = (value) => {",
          "  if (value) {",
          "    return 1;",
          "  }",
          "  return 0;",
          "};",
          "",
        ].join("\n"),
      },
      ""
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ complexity: 2, name: "run" });
  });
});
