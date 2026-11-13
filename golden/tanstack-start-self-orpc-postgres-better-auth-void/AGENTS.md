<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Project

`vibestart.jsonc` records the stack this project was created with. When it also records the `name` and `version` of the vibestart release that generated the project, the vibestart CLI maintains the project from it: `npx vibestart-cli add` adds a capability, and `npx vibestart-cli upgrade --dry-run` previews a template upgrade. Leave `vibestart.jsonc` as the CLI wrote it. An upgrade merges infrastructure files such as `package.json`, `vite.config.ts`, and this file, and lists template changes to starter source, which is yours to edit, as manual changes to port.

## Code

Converge on the simplest durable design that meets current requirements, and land it directly. The change you land is the design that stays.

- Make routine judgment calls yourself. Ask when readings of the request lead to materially different work; when no one can answer, take the reading the code supports and state it in your report.
- Fix the root cause at the abstraction that owns it. Carry the change through every layer it touches, and leave unrelated areas intact.
- Open with a tracer bullet: the smallest end-to-end slice that works, grown in complete layers. Add a concept, configuration option, or extension point only for a use case that exists now.
- One representation, one execution path. Move every in-repository consumer to the final interface, and delete the obsolete API, schema, implementation, configuration, tests, and documentation in the same change. The final interface stands alone: no adapter, deprecated alias, dual read or write, fallback, feature flag, or migration layer beside it.
- A compatibility path exists only for a verified external constraint: a deployed consumer, a public contract, persisted production data, or a staged rollout. An assumed consumer is not a constraint. Isolate the path, name the condition that removes it, and let the final state shape the core. When production state cannot change atomically, ship an explicit, reversible migration with a defined end.
- Validate untrusted data where it enters, then trust it. Type it as `unknown`, narrow it with a schema or a type guard, and make invalid states unrepresentable so later code does not re-check them. `any` is not a type in this repo. Back every type assertion and non-null assertion with a runtime check or a stated invariant. Catch an error only where you recover from it or add context; let the rest propagate.
- Names carry the meaning. A comment states a why the code cannot: an external constraint, counterintuitive behavior, an invariant, or a tradeoff. It speaks to the next reader, never about the change, its history, or its reviewer. Delete a comment that restates the code or has gone stale.
- Lint serves the design. When a rule's concern applies, fix the code. When a rule misfires on the idiom a library documents, keep the idiom and turn the rule off for that library's files in a `lint.overrides` entry in `vite.config.ts`, with a comment naming the idiom.
- Reuse before you write: search the repo's own modules, then its dependencies, their docs, and their types. Otherwise add one mature, maintained library when it lowers total complexity or raises reliability, at the latest stable version the toolchain accepts, and follow its current docs. One library per capability; a few lines of domain logic stay inline.

## Map

| Path                  | Owns                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`            | TanStack Start app: SSR file routes, server routes, server functions; e2e tests in `tests/e2e/`                                                                                       |
| `apps/web/src/server` | Server-only code: request-scoped services via `getServices()`, oRPC handlers, the migration entry                                                                                     |
| `packages/api`        | oRPC routers, `publicProcedure`, `protectedProcedure`, and the `AppRouter` type the web client is typed from                                                                          |
| `packages/db`         | Drizzle schema (`src/schema/`, including Better Auth tables), relations, migrations (`src/migrations/`), `createDb`                                                                   |
| `packages/auth`       | Better Auth configuration (`createAuth`) and the `Session` type                                                                                                                       |
| `packages/ui`         | shadcn/ui components (Base UI), Tailwind theme in `src/styles/globals.css`                                                                                                            |
| `scripts/deploy.ts`   | production database and Hyperdrive prerequisites, migration, then Void deployment                                                                                                     |
| `docs`                | The project's own records: `start.md` (delete it once the conventions are set), `context.md`, `spec/`, `plan/`, and `architecture.md`; its `README.md` says which one wins a conflict |
| `docs/adr`            | ADR records; `README.md` is the index `scripts/adr.mjs` generates                                                                                                                     |
| `daily/架构日志`      | Area logs, the debt ledger, and the index `scripts/arch-index.mjs` generates                                                                                                          |
| `packages/config`     | Shared TypeScript presets                                                                                                                                                             |

`vp run dev` serves the app on :3000. One process handles everything, same-origin, in development and production:

| URL             | Handled by                                                       |
| --------------- | ---------------------------------------------------------------- |
| `/rpc/*`        | oRPC (`src/routes/rpc/$.ts`), used by the browser                |
| `/api/*`        | OpenAPI and the reference docs at `/api` (`src/routes/api/$.ts`) |
| `/api/auth/*`   | Better Auth (`src/routes/api/auth/$.ts`)                         |
| everything else | Server-rendered React routes                                     |

A route `loader` or component calls `api.*` from `src/clients/api.ts`. During SSR that client calls the router in-process with the request's cookies; in the browser it posts to `/rpc`. Loader data is dehydrated into the Query cache, so the browser does not refetch it.

## Conventions

- **Server.** Server-only code lives in `src/server/`. A module that also runs in the browser touches `#src/server/*` only inside a `createServerFn` handler or a `createIsomorphicFn().server()` branch, as `src/clients/api.ts` and `src/clients/auth.ts` do. The Start compiler strips those branches from the client bundle; any other use ships the driver and secrets to the browser.
- **Environment.** Declare every server variable in `apps/web/env.ts` — that is the source; the Environment section of `README.md` is its copy, so change both in the same commit. Keep real values in the ignored `.env` file. Code reads `env` from `void/env`. Vite loads `.env` in development; production gets the variables from the platform.
- **Procedure.** Add it on a router in `packages/api/src/routers/` and register that router in `packages/api/src/index.ts`. Validate input with Zod, read the database from `context.db`, and throw `ORPCError` for an expected failure. The web client takes the new type with no codegen step.
- **Schema.** Add or edit a table in `packages/db/src/schema/`, register a new table in `src/relations.ts`, and back each invariant with a constraint (`check`, `unique`, foreign keys) as well as Zod. Run `vp run db:generate` and commit the new folder under `src/migrations/`. A committed migration stays as generated. The Better Auth tables in `schema/auth.ts` match the fields Better Auth expects; read its docs before adding a plugin.
- **Authorization.** A procedure that reads or writes user data is a `protectedProcedure` and scopes every query by `context.session.user.id`. Someone else's row is `NOT_FOUND`, which does not reveal that the id exists. Each new protected procedure gets an integration test as an anonymous caller and as another user.
- **Protected page.** Put the route under `src/routes/_authenticated/`. The layout sends an anonymous visitor to `/login?redirect=…`. The session sits on the route context (`context.session`), loaded once per navigation in `__root.tsx`. The page hide is UX, and the procedure is the security boundary.
- **Proxy.** Better Auth rate-limits by client IP. Behind a reverse proxy, set `advanced.ipAddress` in `packages/auth` to the header that proxy sets. With no proxy, leave forwarding headers untrusted.
- **UI.** From `packages/ui`, run `pnpm dlx shadcn@latest add <component>` (Bun: `bunx --bun shadcn@latest add <component>`) and import `@my-app/ui/components/<name>`. Files in `packages/ui/src/components` and `packages/ui/src/hooks` are vendored shadcn and are not linted. App code is checked by `@shadcn/lint`: style a component through its variants, and use `className` on it only for layout.
- **Void.** Deploy with `vp run deploy`. Commit `void.lock.json`. Regenerate ignored types with `vp exec --filter @my-app/web void prepare`. Set `DATABASE_URL` and `HYPERDRIVE_ID` in the deployment shell for the same production database. Provision Hyperdrive with query caching disabled; Void binds that existing ID. Database clients belong to one request and close when its response stream finishes, including cancellation or failure.
- **Generated.** `routeTree.gen.ts`, `packages/db/src/migrations/**`, `.cloudflare/`, `.void/`, `scripts/adr.mjs`, `scripts/debt.mjs`, `scripts/probe.mjs`, and `scripts/scan.mjs` are tool output. Leave them unchanged. Run void prepare after cloning to regenerate Worker types
- **Utilities.** Import shared helpers from [es-toolkit](https://es-toolkit.dev/llms.txt), from the submodule the docs name (`import { retry } from "es-toolkit/function"`). `es-toolkit/compat` stays out.
- **Knip.** Delete what `vp run knip` reports: unused files, exports, dependencies, and catalog entries. Add a Knip config entry only when a plugin cannot see a real reference.
- **Ultracite.** Run `vp check` to apply the Ultracite lint and formatting presets, including framework rules and anti-slop checks for AI-written code. Fix the reported code instead of disabling the rules.
- **Scan.** `vp run scan` reports facts — complexity × coverage, and structurally duplicated shapes. It judges nothing: never change code to make the table look better. When it says no coverage report was found, run `vp test --coverage` first; without coverage the CRAP column reflects complexity alone.

## Tests

A test earns its upkeep when its expected values come from a source independent of the code: the request, an acceptance criterion, a documented contract, or a domain rule, written down before the implementation. A test derived from reading the implementation restates it and catches nothing.

- Cover a change with the broadest test that reaches it. End-to-end journeys and integration tests through the real stack carry most of the confidence; a unit test is for dense logic with many cases: calculations, parsers, state machines, permissions.
- Test behavior at the boundary that owns it: the exported API, the command, the route or procedure, the page. A test that breaks under a behavior-preserving refactor is pinned to the implementation; move it to that boundary.
- Before adding a test, name the regression that makes it fail, and confirm no type, schema, lint rule, or existing test already catches it. Each contract has one owning test; extend its table of cases rather than adding a near-copy.
- Run this repo's own code for real. A fake stands in only for a service this repo does not run, with the reason next to it and a contract test that pins the request and response it imitates.
- Watch every new test go red before it goes green. A bug fix starts from a test that reproduces the bug.
- When a test fails, fix the code. Change, skip, or weaken an assertion only when the specified behavior changed, and say so in your report.

| Layer       | Location                                                          | Runs against                                                                                                  | Write it for                                                                             |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| End-to-end  | `apps/web/tests/e2e/*.e2e.ts`                                     | Playwright driving Chromium against the real server and PostgreSQL                                            | Journeys that decide whether the product works                                           |
| Integration | `packages/api/tests/integration/*.test.ts`                        | Vitest calling `appRouter` in process through `createRouterClient`, real sessions, a real PostgreSQL database | Every procedure's validation, error codes, authorization, and invariants                 |
| Unit        | `*.test.ts` beside the code in `apps/web/src` or `packages/*/src` | Node, no I/O                                                                                                  | Branching logic: pricing, permissions, state machines, parsers, calculations, edge cases |

`apps/web/tests/support/server.ts` starts the stack for the e2e tests on :3200 (`E2E_TEST_PORT`): a fresh PostgreSQL database and `vp dev`. A second checkout runs its tests at the same time on another port. Each integration test file gets a database of its own from `createTestDatabase()` in `@my-app/db/testing`, migrated and removed when the file ends, so files run in parallel. Test databases are created beside `DATABASE_URL` from `apps/web/.env`, so the tests need PostgreSQL running. Tests sign up a new user with `signUp()`, so they share no rows.

Open and reload pages with `visit()` before clicking. Network idle does not prove hydration; controls that need client JavaScript must stay disabled until hydration completes. Assert with Playwright's web-first assertions (`toBeVisible`, `toHaveURL`, `toBeChecked`).

Integration tests call the procedures in this process, through the same middleware and validation as a request, with real Better Auth sessions and a real database.

E2E tests in `apps/web/tests/e2e` are the specification: changing, skipping, or weakening an assertion takes the user's approval first.

While iterating, run the narrowest set that covers the change: `vp test --project unit`, `vp test --project integration`, `vp test --changed`, a single file, or `vp exec playwright test <file>` in `apps/web`.

## 治理

这个项目把约定按**变化速度**分层：意图（`docs/context.md`，慢）、行为（`docs/spec/`，中）、实现（`docs/architecture.md` 是代码的摘要，快）、判据（`docs/adr/`，只增不改），外加一份一次性的施工图（`docs/plan/`，落地即作废）和一份账本（`daily/架构日志/债务.md`）。

**冲突时谁赢、什么时候读哪份，写在 `docs/README.md` 的表里** —— 去查，别在这里背。本节只讲**怎么干活**。

### 开工确认（硬性）

**`docs/start.md` 还在 ⇒ 先按它把约定定下来，再动业务代码。** 它是开局引导，第一件就是定技术栈 —— 要换现在换，不换以后不再换；全部做完就删。

动任何文件之前，先读：

1. `docs/context.md`（一次就够，除非产品变了）。
2. 本次要动的能力对应的 `docs/spec/<能力>.md`，以及 `docs/adr/README.md` 里相关的条目。

第一次回复的第一行必须有确认：

```text
已读完 docs/context.md + docs/spec/<能力>.md + 相关 ADR；本次最相关条款：<编号或小节>
```

并附上那几条的**原文要点**（照原文写，不许凭记忆复述）。找不到对应 spec 时，先说明「这个能力还没有 spec」，再决定是先补 spec 还是直接改 —— 不许假装读过。

### 改东西的顺序

0. **先写 plan**：`docs/plan/<YYYY-MM-DD>-<能力>.md`，骨架在 `docs/plan/README.md`。不写 plan 不许动代码；plan 是一次性的，落地后删掉或把结论并进 spec / architecture。
1. **改行为**：先看 spec 怎么写的；没有就先补一份（`docs/spec/README.md` 有骨架）。改 spec，再改代码 —— 除非用户明确说「先做，spec 后补」。
2. **纯重构 / 笔误**：行为不变就不动 spec，也不用写 plan。
3. **分层、依赖方向、跨模块不变量变了**：同一批提交里改 `docs/architecture.md`。
4. **推翻了既有判据**：新写一条 ADR，旧的那条只改状态。

卡住时两条，先想第二条：

- **造杠杆**：一眼看不明白，就先把「做这件事的工具」造出来 —— 先手工做一个单元，再让工具去对齐它。
- **攻前提**：两个共享同一前提的修法，在同一道门禁上双双失败 ⇒ 把这个前提炼成一句话写下来，去掉那个指定，再开始下一个修法。在这之前不许试第三个。

### 体检（用户口令）

体检有**两个时刻**，都在改完之后才有价值：动手前找债，动手后确认没留下残渣。

**动手前**：按 spec / ADR / architecture 逐条对代码，找「写的和做的不一样」。顺序固定：`docs/spec/` 的行为表 → 相关 ADR 的判据 → `docs/architecture.md` 的分层与不变量 → 债务账本。

- **不是跑测试。** `vp run ready` 全绿是另一件事，不许拿它当体检结论。
- **默认不改行为。** 只出清单（条款 → 现状 → 偏差 → 处置）；要改代码先等用户点头。
- 偏差分三类：**代码错**（行为不符 spec，或违反 ADR / 不变量）、**文档错**（`architecture.md` 落后于代码，或 spec 里写的是实现细节）、**缺一环**（两边都对但少了衔接，补进 spec 或 architecture）。
- 行为不符时**不许自己判谁对**：spec 是意图，只有人能改意图 ⇒ 报给用户裁定。

**动手后**（改完、删完之后）：确认没留残渣、没删坏、没把复杂度搬到别处。三件事，缺一件不算做完：

1. **垂直删净**：声明 / schema / 路由 / 命令 / manifest → 注册与分发 → 实现与状态 → 导入导出与构建清单 → 迁移 / fixture / 文档 / 运维配置 → 专属测试 → 不再需要的依赖与脚本。
2. **分环验证，分开报**：残留检查（搜被删的名字、字符串、路径、flag）→ 决定性检查（删错就会红的那个）→ 复跑当初产出这个判断的分析 → 本地门 → 仓库门 → 边界对比（对外输出、持久化形状）→ diff 审计。**单测绿不等于能交付。**
3. **出回执**：改了哪个边界 / 基线 / 退休的义务 / 产物 / 实际净效果 / 行为变化 / 验证命令与结果 / 剩余风险 / 保留的候选 / **怎么撤**。撤销路径必须与副作用匹配 —— 源码可回退，迁移和发布要单独写恢复步骤。

**复杂度与重复有没有搬家，用 `vp run scan` 看**：它只出事实（复杂度 × 覆盖率、结构重复的形状），判不了对错，也不进 `ready`。动手后跑一次，把改动前后 CRAP 最高的几行、重复对数比一比 —— 数字变差就是复杂度被搬到了别处，回去改结构。

**决定性检查用 `node scripts/probe.mjs` 跑**：它临时注入一处改动、跑一条命令、断言「退出码 + 输出命中」，然后无条件还原。注入点不唯一就拒绝执行（命中 0 处也算失败），所以「命令本来就红」不会被当成「探针命中」。

### 合并同类项（去重体检）

「简化」不是删行数，是**减少必须同时保持一致的概念数**。用户说「合并同类项」或「简化」时，先列**覆盖地图**（in-scope 的入口、边界，以及没看的盲区），再按九个透镜找候选 —— 不要停在第一个看起来能删的东西上。

| 透镜         | 症状                                                    |
| ------------ | ------------------------------------------------------- |
| 休眠契约     | 导出 / 选项 / 事件 / 命令没有生产消费者                 |
| 分裂真相     | 同一事实存在两处状态、缓存、格式，必须手动同步          |
| 无主灵活性   | 抽象 / 开关 / 扩展点，当前没有任何产品路径拥有它        |
| 中转层       | 包装 / 包 / 服务只转发，不减少耦合、不建立边界          |
| 并行状态机   | flag / promise / 队列 / 哨兵描述同一个状态转移          |
| 边界表演     | 在可信交接处做校验、拷贝、回滚（假边界）                |
| 自造基础设施 | 自己写解析、重试、调度、集合运算，而平台或依赖已有      |
| 支撑拖拽     | 只有测试、文档、快照还在支撑一个没人用的面              |
| 功能化石     | 功能已删，schema / 配置 / 测试 / 兼容逻辑还留着它的轮廓 |

证据阶梯：**闻到味道 → 静态线索 → 消费者地图 → 契约证据 → 行为证据**。前两级**不是删除授权**；到契约证据才能动手，到行为证据才算证完。每条候选写清两格：

- **Proof**：能暴露「删错了」的最小检查。
- **净效果**：删掉的概念 − 新增的迁移 / 兼容机制。为负就是没简化，只是搬了家。

**长得像不等于重复。** 两份实现可能是为了隔离失败域、测一个接口、或遵守不同的兼容契约 —— 合并前先回答「它们的所有权边界是同一个吗」。删掉一个可达能力（工具 / 路由 / 导出面 / 已存数据格式）是产品决定，单独授权，不许混在体检里。

### 检查

| 阶段     | 跑什么         | 说明                                                 |
| -------- | -------------- | ---------------------------------------------------- |
| 写代码时 | `vp check`     | 每改一批扫一眼，**不是交付闸**                       |
| 写完代码 | `vp run ready` | `vp check` → `vp run knip` → `vp test`，各跑**一次** |

`vp run adr` / `vp run debt` / `vp run arch` 是独立命令，与代码检查无关，不进 `ready`。

**只保留官方命令。** 不新建「扫一遍源码判对错、并据此报错」的机器闸（`docs/adr/ADR-0009-约定只走三级阶梯：禁会绕路的闸，不禁只出事实的扫描.md`）：靠正则查「某处不许出现 X」，换个文件写同样实现就能绕过，比没有更糟。要禁止一件事，按 `ADR-0004` 让第二处**没必要存在**，或让写错**编译不过**。

**测试先写。** 改逻辑之前先写会失败的测试，亲眼看着它因为**预期的原因**失败，再用最小的改动让它过。写不出诚实的测试就别写一个坏的 —— 覆盖率不是目标。

`scripts/` 下的三个工具（`adr.mjs` / `debt.mjs` / `probe.mjs`）是从治理 kit 复制的：**改 kit，不改副本** —— 改副本会让下次升级变成整文件冲突。`arch-index.mjs` 是例外，它的 `AREAS` 就是给你改的。

**不给文档做测试。**

- 只测「该不该存在」（生成的文件路径对不对），不测写了什么。改一句话就让测试变红，说明测错了对象。
- UI 测试跑不起来：`vite.config.ts` 的 `test.projects` 不收 `apps/web`，`packages/ui` 也被排除。所以 UI 里出现值得测的算法，把它迁到 `packages/*/src` 的纯函数再测 —— 测算法，不测渲染。

### ADR（`docs/adr/`）

ADR 是**现行判据集**，不是决策日志。它唯一的用处：把「AI 每次动这块都必须照做、但类型与测试拦不住」的约束写下来，别让代码一层层烂成屎山。

写一条，当且仅当三条都成立：

1. **约束的是反复发生的行为**：不是「这次怎么改」（那是 plan），而是「以后每次动这块都要照做」。
2. **类型 / 结构 / 测试拦不住**：能让写错编译不过、能让第二处没必要存在的，就去改代码，不写 ADR（`ADR-0004`）。
3. **不写就会烂**：下一个人或 AI 照直觉做，会加一层壳、留一条兜底、多开一个入口。

任一条不成立就不写：只对这次成立 ⇒ 写 plan；能被结构固定 ⇒ 去改代码；只是「当时的取舍」 ⇒ 写区域日志。

**别拿「防止第二个同类实现」当写 ADR 的理由** —— 重复是结构问题，用结构解决；按那个标准写，账两天就爆满。判据由人定，所以落盘必须带 `--user-approved`。

- **正文可以改**，但分两种，顺序是「修正 > 改主意」：
  - **修正**：原文写错了，照原样执行会导出错动作 ⇒ 直接改正文，并**留痕**（标日期 + 原作 ⇒ 现作 + 为什么）。
  - **改主意**：决策变了 ⇒ 不动旧条，新写一条并 `status --to 已取代 --by`。
- **静默改写**才是被禁的「改历史」：改了不留痕，下一个人会以为旧结论还是现行的。
- 新增、改状态、改索引一律走脚本，**禁手写 `README.md` 的索引表**。

ADR 也会积灰。判断一条能不能退出「现行」：

| 分类       | 判据                                                     |
| ---------- | -------------------------------------------------------- |
| 现行       | 仍拥有活的契约、兼容规则，或仍有用的被否决替代           |
| 部分被取代 | 部分行为已被新记录接管                                   |
| 完全被取代 | 没有生产 / 持久化 / 线上行为残留，且新记录能承接全部理由 |

只有「完全被取代」才能 `status --to 已弃用`。退出前**搬运**：独特理由、被否决的替代、后果、放弃的能力、**重新引入的条件**。搬不完就留着 —— 「为什么当初不这么做」比结论更值钱。文件不删：`rm` 只用于误建和重复。

```bash
node scripts/adr.mjs list --all
node scripts/adr.mjs add --title "…" --conclusion "…" --user-approved
node scripts/adr.mjs status 0005 --to 已取代 --by 0006 --note "…"
node scripts/adr.mjs index --write
node scripts/adr.mjs audit
```

### 债务（`daily/架构日志/债务.md`）

碰到既有代码违反 ADR、spec 或 architecture：**先登记债，继续手上的活**，不许顺手改，也不许只在回答里提一句。

- 唯一账本 `daily/架构日志/债务.md`，唯一写入口 `scripts/debt.mjs`；**禁手写表格行**。
- 摘要 ≤120 字，禁裸 `|`，引号用「」。审计可以结论「无债」，不许为凑数登记假债。
- 回答里只给债号（`TD-<区号>-<序号>`），不复述全文。

区号（`scripts/arch-index.mjs` 的 `AREAS` 必须与这张表一致）：

| 区号 | 区域           |
| ---- | -------------- |
| 01   | 领域与业务规则 |
| 02   | 数据与持久化   |
| 03   | 接口与装配     |
| 04   | UI 与交互      |
| 05   | 测试与验收     |
| 06   | 构建与发布     |
| 07   | 文档与治理     |

```bash
node scripts/debt.mjs add --area 03 --summary "…" --class 增债 --rate 中
node scripts/debt.mjs list
node scripts/debt.mjs show TD-03-1
node scripts/debt.mjs resolve TD-03-1 --note "销账证据"
node scripts/debt.mjs archive
```

区域日志 `daily/架构日志/<NN>-<区域>-<主题>-<日期>.md` 是**明细真源**：探到了什么、证据、结论。`债务.md` 只登记一行摘要，`index.md` 由 `node scripts/arch-index.mjs` 生成。三者不互相复述；起头复制 `_template.md`。

### 沟通

1. 第一行给动作方案：下一步做什么、改哪里、什么结论；不写「让我看看 / 好的 / 我来分析」。
2. 多步任务编号 `1. 2. 3.`，每步一个动作。
3. 报错就事论事：原因 + 修法。
4. 结尾给一个能立刻动手的下一步：一条命令、一次点击，或打开一个文件。不给「下一步可以考虑…」。
5. **例行维护直接做完再报告**：跑体检、跑 `vp run ready`、把同一处改动铺到一批文件这类，不要先出方案、不要问要不要做。只有要删一个可达能力、要改一个对外契约、或要把默认行为改成不兼容值时才停下来问。

### 交付前四问（硬性）

**绿 ≠ 对。** `vp run ready` 全绿只证明没踩坏现有检查，证明不了没多造第二条路。每次回答用户时，把下面四问的答案写进回答里，答不出或答成「应该没有」按未完成处理：

1. 这轮动了哪个入口？**旧入口还在吗**？
2. 旧入口如果还在，它的消费者**全部**迁完了吗？没迁完 = 两条线 = **未完成**。
3. 同一能力数出几个入口？同前缀并存（`Xxx` 与 `XxxOr`）或旧入口仍被调用 ⇒ **两条线**。
4. **这段代码，下一个 AI 看得懂吗**？看不懂且没有唯一范本可照抄 ⇒ 不许交付。

出现两条线 ⇒ 不许写「已完成 / 已修复 / 已收口」，回去删掉其中一条。

## Done

The change is done when every modified path works end to end, every rule in this file holds in every modified file, and `vp run ready` passes.

Before you report it, review the whole diff in a fresh context when your tools allow one: read the failure and cleanup paths, a second run against existing state, and every caller of what changed, and fix what you find.
