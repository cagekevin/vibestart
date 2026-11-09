import { describe, expect, it } from "vite-plus/test";

import { legalStacks, resolve } from "@vibestart/core";

import { registry } from "#/registry.ts";
import { stacksByLabel } from "#/stack-label.ts";

describe("the registry", () => {
  // A label keys the preview file, the golden directory, and the verification record: two stacks that share one
  // would share a record, and a project would be told it is verified without ever having run.
  it("gives every legal stack a label of its own", () => {
    expect(stacksByLabel(legalStacks(registry)).size).toBe(
      legalStacks(registry).length
    );
  });

  it("links every third-party integration to its official site over HTTPS", () => {
    // `self` and `governance` are vibestart's own glue: a framework's server routes, and the rules and
    // scripts this repository ships. Neither has a project of its own to link.
    const ours = new Set(["governance", "self"]);

    const linked = [...registry.integrations, ...registry.addons].filter(
      ({ id }) => !ours.has(id)
    );

    expect(
      linked.flatMap(({ homepage, id }) => (homepage === undefined ? [id] : []))
    ).toStrictEqual([]);

    for (const { homepage } of linked) {
      expect(new URL(homepage ?? "").protocol).toBe("https:");
    }
  });

  // Prisma's SQLite drivers are native modules, which the bundled image cannot carry.
  it.each([
    ["postgres", ["drizzle", "prisma"]],
    ["mysql", ["drizzle", "prisma"]],
    ["sqlite", ["drizzle"]],
    ["mongodb", ["mongoose"]],
  ])("offers %s the ORMs %j", (database, orms) => {
    const offered = new Set(
      resolve(registry, { database }).stacks.map(({ orm }) => String(orm))
    );

    expect([...offered].toSorted((a, b) => a.localeCompare(b))).toStrictEqual(
      orms
    );
  });

  // Void deploys a React web app to Workers, which reach a SQL server only through Hyperdrive and Drizzle.
  it.each([
    ["framework", ["spa", "tanstack-start"]],
    ["backend", ["hono", "none", "self"]],
    ["database", ["mysql", "none", "postgres"]],
    ["orm", ["drizzle", "none"]],
    ["runtime", ["workers"]],
  ])("deploys with Void the %s choices %j", (kind, ids) => {
    const offered = new Set(
      resolve(registry, { deployment: "void" }).stacks.map(
        (stack) => stack[kind] ?? "none"
      )
    );

    expect([...offered].toSorted((a, b) => a.localeCompare(b))).toStrictEqual(
      ids
    );
  });

  it("runs on Workers only what Void deploys", () => {
    expect(
      resolve(registry, { deployment: null, runtime: "workers" }).stacks
    ).toHaveLength(0);
  });

  it("signs users in on MongoDB as on a SQL database", () => {
    expect(
      resolve(registry, { auth: "better-auth", database: "mongodb" }).stacks
    ).not.toHaveLength(0);
  });
});
