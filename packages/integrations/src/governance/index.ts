import { contribute, defineAddon, packageJson } from "@vibestart/core";

import { templateFiles } from "#/templates.ts";
import {
  agentsMap,
  agentsSections,
  generatedFiles,
  ignoredFiles,
  toolConventions,
  vendoredFiles,
} from "#/vite-plus/slots.ts";

import agentsGovernance from "./agents-governance.md?raw";

/**
 * The kit's own tools, copied from `templates/governance/scripts`. `vp check` must not reformat or relint
 * them: they are upstream files a project runs, not source it edits, and a reformat would turn every future
 * copy of the kit into a whole-file diff.
 */
const scripts = ["adr.mjs", "debt.mjs", "probe.mjs", "scan.mjs"];

/**
 * The records a project keeps about itself, split by how fast they change and who owns them: intent
 * (`docs/context.md`), behaviour (`docs/spec/`), the shape of the code (`docs/architecture.md`), and the
 * decisions that override all three (`docs/adr/`). `docs/README.md` holds the map and says which one wins a
 * conflict, so no file has to restate another. The debt a project has not paid lives in
 * `daily/架构日志/债务.md`, with a script as its only write path.
 *
 * Starter source, not infrastructure: `docs/` and `daily/` are the project's own records, so an upgrade
 * leaves them alone. `AGENTS.md` is merged, which is why its governance section arrives through a slot.
 */
export const governance = defineAddon({
  contribute: (ctx) => [
    ...templateFiles(ctx, "governance"),
    contribute(agentsSections, agentsGovernance.trimEnd()),
    contribute(agentsMap, {
      owns: "The project's own records: `start.md` (delete it once the conventions are set), `context.md`, `spec/`, `plan/`, and `architecture.md`; its `README.md` says which one wins a conflict",
      path: "docs",
    }),
    contribute(agentsMap, {
      owns: "ADR records; `README.md` is the index `scripts/adr.mjs` generates",
      path: "docs/adr",
    }),
    contribute(agentsMap, {
      owns: "Area logs, the debt ledger, and the index `scripts/arch-index.mjs` generates",
      path: "daily/架构日志",
    }),
    ...scripts.map((script) =>
      contribute(generatedFiles, {
        glob: `scripts/${script}`,
        label: `scripts/${script}`,
      })
    ),
    // `arch-index.mjs` is the one script a project edits: its `AREAS` list names the areas this project is
    // audited by. It is still not linted, as the kit writes it in a style this project's rules reject.
    contribute(vendoredFiles, "scripts/arch-index.mjs"),
    // `probe.mjs` journals a file's original text before it injects a change; an interrupted run leaves one.
    contribute(ignoredFiles, "scripts/.probe"),
    // `scan.mjs` writes the snapshot it also prints; it is output, not source.
    contribute(ignoredFiles, ".metrics"),
    contribute(packageJson, {
      // `scan.mjs` reads the source tree through Oxc's parser; nothing else here parses code.
      devDependencies: ["oxc-parser"],
      path: ".",
      scripts: {
        adr: "node scripts/adr.mjs audit && node scripts/adr.mjs refs --check",
        arch: "node scripts/arch-index.mjs",
        debt: "node scripts/debt.mjs audit",
        scan: "node scripts/scan.mjs",
      },
    }),
    contribute(toolConventions, {
      text: "`vp run scan` reports facts — complexity × coverage, and structurally duplicated shapes. It judges nothing: never change code to make the table look better. When it says no coverage report was found, run `vp test --coverage` first; without coverage the CRAP column reflects complexity alone.",
      title: "Scan",
    }),
  ],
  default: true,
  description:
    "AGENTS.md rules, initial ADRs, and a debt ledger, with the scripts that maintain them",
  id: "governance",
  name: "Governance",
  supportsAdd: true,
});
