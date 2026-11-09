import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "citty";
import { afterAll, describe, expect, vi, it } from "vite-plus/test";
import { z } from "zod";

import { legalStacks, verificationSchema } from "@vibestart/core";
import { registry } from "@vibestart/integrations";

import { command } from "#/command.ts";

// Nothing fills a choice the caller leaves open, so every flag a test relies on is stated here.
const restApi = [
  "--framework",
  "none",
  "--backend",
  "hono",
  "--api",
  "openapi",
  "--database",
  "sqlite",
  "--orm",
  "drizzle",
  "--auth",
  "none",
  "--ui",
  "none",
  "--desktop",
  "none",
  "--mobile",
  "none",
  "--runtime",
  "node",
  "--deployment",
  "none",
  "--testing",
  "playwright",
];

const failureSchema = z.object({ error: z.object({ message: z.string() }) });

const run = async (...rawArgs: string[]) => {
  const writes: string[] = [];

  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));

      return true;
    });

  try {
    await runCommand(command, { rawArgs: [...rawArgs, "--json"] });
  } finally {
    write.mockRestore();
  }

  const { exitCode } = process;
  process.exitCode = undefined;
  const output: unknown = JSON.parse(writes.join(""));
  const failure = failureSchema.safeParse(output);

  return {
    exitCode,
    message: failure.success ? failure.data.error.message : undefined,
    output,
  };
};

const previewSchema = z.object({
  files: z.array(z.object({ path: z.string() })),
});

const dryRunPaths = async (directory: string, ...flags: string[]) => {
  const { output } = await run(directory, ...restApi, ...flags, "--dry-run");

  return previewSchema.parse(output).files.map((file) => file.path);
};

describe("--list", () => {
  it("lists every kind and legal stack with current verification metadata", async () => {
    const { exitCode, output } = await run("--list");
    expect(exitCode).toBe(0);
    expect(output).toHaveProperty("ok", true);
    expect(output).toHaveProperty("kinds.length", registry.kinds.length);
    expect(output).toHaveProperty(
      "stacks.length",
      legalStacks(registry).length
    );

    const listing = z.object({
      stacks: z.array(z.object({ verifiedAt: z.iso.datetime().nullable() })),
    });

    expect(listing.safeParse(output).success).toBeTruthy();
  });
});

describe("choosing a stack", () => {
  it("selects the end-to-end runner only when asked", async () => {
    const choices = [
      "app",
      "--dry-run",
      "--framework",
      "spa",
      "--backend",
      "hono",
      "--api",
      "orpc",
      "--auth",
      "none",
      "--database",
      "sqlite",
      "--orm",
      "drizzle",
      "--runtime",
      "node",
      "--ui",
      "shadcn",
      "--router",
      "tanstack-router",
    ];

    const selected = await run(...choices, "--testing", "e2e");
    expect(selected.exitCode).toBe(0);
    expect(selected.output).toHaveProperty("stack.testing", "e2e");

    // No default: a stack the caller left open names the kinds it still needs instead of picking one.
    const open = await run(...choices);
    expect(open.output).toMatchObject({
      error: { code: "incomplete-stack" },
      ok: false,
    });
  });

  it("explains an illegal stack and offers the smallest fixes as flags", async () => {
    const { exitCode, output } = await run(
      "app",
      "--frontend",
      "none",
      "--api",
      "openapi",
      "--auth",
      "better-auth",
      "--database",
      "none"
    );

    expect(exitCode).toBe(1);
    expect(output).toMatchObject({
      error: {
        code: "illegal-stack",
        fixes: [
          { flags: ["--database postgres"] },
          { flags: ["--database mysql"] },
          { flags: ["--database sqlite"] },
          { flags: ["--database mongodb"] },
          { flags: ["--auth none"] },
        ],
        violations: [{ integration: "drizzle", type: "missing-capability" }],
      },
    });
  });

  it("rejects an unknown option and an unknown value", async () => {
    const typo = await run("--databse", "sqlite");
    expect(typo).toMatchObject({
      exitCode: 1,
      output: { error: { code: "invalid-option" } },
    });
    expect(typo.message).toContain("Unknown option --databse.");

    const unknown = await run("--database", "oracle");
    expect(unknown.exitCode).toBe(1);
    expect(unknown.message).toContain(
      '--database is one of postgres, mysql, sqlite, mongodb, none; got "oracle"'
    );
  });

  it("rejects an add-on the registry does not offer", async () => {
    const { exitCode, message } = await run("--addons", "knip,eslint");
    expect(exitCode).toBe(1);
    expect(message).toContain(
      '--addons takes knip, ultracite, governance, or none; got "eslint"'
    );
  });
});

describe("creating a project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vibestart-"));
  const directory = path.join(root, "my-api");

  afterAll(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("a dry run resolves the stack and lists the files, writing nothing", async () => {
    const { exitCode, output } = await run(directory, ...restApi, "--dry-run");

    const preview = z
      .object({
        fileCount: z.number(),
        files: z.array(z.object({ owner: z.string(), path: z.string() })),
      })
      .parse(output);

    expect({ exitCode, output }).toMatchObject({
      exitCode: 0,
      output: {
        dryRun: true,
        fileCount: preview.files.length,
        label: "hono-openapi-sqlite",
        project: { directory, name: "my-api" },
        steps: [],
      },
    });
    expect(
      z
        .object({ verification: verificationSchema.valueType.nullable() })
        .safeParse(output).success
    ).toBeTruthy();

    expect(preview.files).toContainEqual({
      owner: "core",
      path: "vibestart.jsonc",
    });
    expect(preview.files).toContainEqual({
      owner: "environment",
      path: "apps/server/.env",
    });
    await expect(readdir(directory)).rejects.toThrow("ENOENT");
  });

  it("deploys with Docker only when asked", async () => {
    const target = path.join(root, "deployed");
    await expect(dryRunPaths(target)).resolves.not.toContain("Dockerfile");
    await expect(
      dryRunPaths(target, "--deployment", "docker")
    ).resolves.toContain("Dockerfile");
  });

  it("adds an Expo app only when asked, alone or beside a server", async () => {
    const target = path.join(root, "mobile");
    await expect(dryRunPaths(target)).resolves.not.toContain(
      "apps/mobile/app.json"
    );
    await expect(dryRunPaths(target, "--mobile", "expo")).resolves.toContain(
      "apps/mobile/app.json"
    );

    const mobileOnly = [
      "--framework",
      "none",
      "--backend",
      "none",
      "--api",
      "none",
      "--database",
      "none",
      "--orm",
      "none",
      "--auth",
      "none",
      "--ui",
      "none",
      "--router",
      "none",
      "--runtime",
      "none",
      "--testing",
      "playwright",
      "--mobile",
      "expo",
    ];

    const alone = await run(target, ...mobileOnly, "--dry-run");
    expect(alone.output).toMatchObject({ label: "expo", ok: true });
    await expect(
      run(target, ...mobileOnly, "--deployment", "docker", "--dry-run")
    ).resolves.toMatchObject({
      exitCode: 1,
      output: {
        error: {
          code: "illegal-stack",
          violations: [{ integration: "docker", type: "missing-capability" }],
        },
        ok: false,
      },
    });
  });

  it("takes the default add-ons unless told otherwise, and stays verified without them", async () => {
    const target = path.join(root, "addons");
    const defaults = await run(target, ...restApi, "--dry-run");
    expect(defaults.output).toMatchObject({
      addons: ["knip", "ultracite", "governance"],
      ok: true,
    });

    const ultracite = await run(
      target,
      ...restApi,
      "--addons",
      "ultracite",
      "--dry-run"
    );

    expect(ultracite.output).toMatchObject({ addons: ["ultracite"], ok: true });
    const knip = await run(target, ...restApi, "--addons", "knip", "--dry-run");
    expect(knip.output).toMatchObject({ addons: ["knip"], ok: true });

    const { output } = await run(
      target,
      ...restApi,
      "--addons",
      "none",
      "--dry-run"
    );

    expect(output).toMatchObject({ addons: [], ok: true });
    const result = z.object({ verification: z.unknown() });
    expect(result.parse(output).verification).toStrictEqual(
      result.parse(defaults.output).verification
    );
  });
});

describe("Effect mode", () => {
  it("selects the reviewed stack and previews the native Effect files", async () => {
    const result = await run(
      "effect-app",
      "--mode",
      "effect",
      "--database",
      "postgres",
      "--orm",
      "drizzle",
      "--runtime",
      "node",
      "--testing",
      "playwright",
      "--auth",
      "better-auth",
      "--dry-run"
    );

    expect(result).toMatchObject({ exitCode: 0, message: undefined });

    const paths = previewSchema
      .parse(result.output)
      .files.map((file) => file.path);

    expect(paths).toContain("packages/contracts/src/rpc.ts");
    expect(paths).not.toContain("apps/web/src/clients/query-client.ts");
  });

  it("lists only adapted options in Effect mode", async () => {
    const result = await run("--list", "--mode", "effect");
    expect(result.exitCode).toBe(0);

    const output = z
      .object({
        kinds: z.array(
          z.object({
            id: z.string(),
            default: z.string().nullable().optional(),
            options: z.array(z.object({ id: z.string() })),
          })
        ),
        stacks: z.array(z.object({ stack: z.object({ mode: z.string() }) })),
      })
      .parse(result.output);

    expect(output.stacks).toHaveLength(80);
    // Only the empty choices keep a default; nothing a user has to decide is filled for them.
    expect(
      ["mode", "database", "desktop", "mobile", "testing"].map(
        (kind) => output.kinds.find(({ id }) => id === kind)?.default
      )
    ).toStrictEqual(["effect", undefined, null, null, undefined]);
    expect(
      output.stacks.every(({ stack }) => stack.mode === "effect")
    ).toBeTruthy();
    expect(
      ["backend", "desktop", "mobile"].map(
        (kind) => output.kinds.find(({ id }) => id === kind)?.options
      )
    ).toStrictEqual([
      [{ id: "effect-http" }],
      [{ id: "electron" }],
      [{ id: "expo" }],
    ]);
  });

  it.each(["playwright", "e2e"])(
    "creates a stateless Effect project with %s",
    async (testing) => {
      const result = await run(
        "effect-app",
        "--mode",
        "effect",
        "--database",
        "none",
        "--orm",
        "none",
        "--auth",
        "none",
        "--testing",
        testing,
        "--dry-run"
      );

      expect(result).toMatchObject({ exitCode: 0, message: undefined });

      const paths = previewSchema
        .parse(result.output)
        .files.map((file) => file.path);

      expect(paths).toContain("packages/contracts/src/rpc.ts");
      expect(paths).toContain(
        testing === "playwright"
          ? "apps/web/playwright.config.ts"
          : "apps/web/e2e.config.ts"
      );
      expect(
        paths.some(
          (file) =>
            file.startsWith("packages/db/") || file.startsWith("packages/auth/")
        )
      ).toBeFalsy();
    }
  );

  it.each(["postgres", "sqlite"])(
    "creates public Effect todos on %s",
    async (database) => {
      const result = await run(
        "effect-app",
        "--mode",
        "effect",
        "--database",
        database,
        "--auth",
        "none",
        "--testing",
        "playwright",
        "--dry-run"
      );

      expect(result).toMatchObject({ exitCode: 0, message: undefined });

      const paths = previewSchema
        .parse(result.output)
        .files.map((file) => file.path);

      expect(paths).toContain("apps/web/src/routes/todos.tsx");
      expect(paths).toContain("packages/db/src/index.ts");
      expect(
        paths.some((file) => file.startsWith("packages/auth/"))
      ).toBeFalsy();
      expect(paths).not.toContain("apps/web/src/routes/login.tsx");
    }
  );

  it("rejects mixed stacks without suggesting a mode change", async () => {
    const result = await run(
      "effect-app",
      "--mode",
      "effect",
      "--api",
      "orpc",
      "--dry-run"
    );

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("--api effect-rpc");
    expect(result.message).not.toContain("--mode standard");
  });
});
