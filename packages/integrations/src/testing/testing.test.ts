import { describe, expect, it } from "vite-plus/test";

import { compose, createBlueprintSchema, resolve } from "@vibestart/core";

import { registry } from "#/registry.ts";

const journeys = import.meta.glob<string>(
  "../../templates/testing/*/*/apps/web/tests/e2e/*.e2e.ts",
  { eager: true, import: "default", query: "?raw" }
);

const journeysOf = (runner: string) =>
  new Map(
    Object.entries(journeys).flatMap(([path, content]) => {
      const [, owner, variant] =
        /testing\/(?<owner>[^/]+)\/(?<variant>[^/]+)\//u.exec(path) ?? [];

      return owner === runner && variant !== undefined
        ? [
            [
              variant,
              [...content.matchAll(/^\s*test\("(?<title>[^"]+)"/gmu)].map(
                ({ groups }) => groups?.title
              ),
            ],
          ]
        : [];
    })
  );

const recordedRunner = (testing: string) =>
  createBlueprintSchema(registry).parse({
    channel: "recommended",
    stack: { testing, toolchain: "vite-plus" },
  }).stack.testing;

describe("choosing the browser test runner", () => {
  it("defaults to Playwright", () => {
    expect(compose(registry, {}).testing).toBe("playwright");
  });

  it("offers e2e only to a stack with a web app", () => {
    expect(
      resolve(registry, { framework: null, testing: "e2e" }).stacks
    ).toStrictEqual([]);
  });

  it("reads the runner ids that earlier releases wrote", () => {
    expect(recordedRunner("vitest-playwright")).toBe("playwright");
    expect(recordedRunner("vitest-e2e")).toBe("e2e");
  });

  // The runner is a choice, not a second set of journeys: both variants carry the same tests.
  it("runs the same journeys under either runner", () => {
    const e2e = journeysOf("e2e");

    expect(e2e.size).toBeGreaterThan(0);
    expect(e2e).toStrictEqual(journeysOf("playwright"));
  });
});
