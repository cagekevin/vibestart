import type { PackageManager, Stack } from "@vibestart/core";

export const stackLabel = (stack: Stack) =>
  [
    stack.framework,
    stack.backend,
    stack.api,
    stack.database,
    ...(stack.orm === "prisma" ? ["prisma"] : []),
    stack.auth,
    stack.desktop,
    stack.mobile,
    ...(stack.runtime === "bun" ? ["bun"] : []),
    stack.deployment,
    ...(stack.testing === "e2e" ? ["e2e"] : []),
  ]
    .filter((id) => id !== undefined)
    .join("-");

/**
 * A label identifies a stack: the preview file, the golden directory, and the verification record are all keyed
 * by it. Two stacks that share one would share a record, so a project would be told it is verified when it never
 * ran. Failing here, naming both stacks, is the only way that cannot pass unnoticed.
 */
export const stacksByLabel = <T extends Stack>(stacks: readonly T[]) => {
  const byLabel = new Map<string, T>();

  for (const stack of stacks) {
    const label = stackLabel(stack);
    const taken = byLabel.get(label);

    if (taken !== undefined) {
      throw new Error(
        `Two stacks share the label "${label}": ${JSON.stringify(taken)} and ${JSON.stringify(stack)}`
      );
    }

    byLabel.set(label, stack);
  }

  return byLabel;
};

/** Bun and pnpm generate the same sources, so a Bun package-manager task keeps the stack label and adds this suffix. */
export const taskLabel = (
  stack: Stack,
  packageManager: PackageManager = "pnpm"
) =>
  packageManager === "bun" ? `${stackLabel(stack)}-bun-pm` : stackLabel(stack);
