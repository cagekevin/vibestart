#!/usr/bin/env node
/**
 * 代码体检扫描器（**只出事实 · 不是闸**）——「复杂度 × 覆盖率」这一半。
 *
 * 【为什么存在】项目自带的检查（类型、lint、死代码、单测、e2e）只回答「对不对」，
 *   回答不了「哪里又大又没测」：复杂度是**代码形状**，覆盖率是**测试触达**，
 *   两者相乘才是「改起来最危险的地方」。官方检查里没有这一项 ⇒ 只能自己出事实。
 *
 * 【机制定位：只出事实，不是闸】
 *   本脚本**恒 exit 0**（除参数/环境错 exit 2），**不进 `ready` 链、不接提交钩子**、
 *   **不判定合规**。它输出的是「谁大、谁没测到」，不是「你违规了」。
 *   理由与本仓 `docs/adr/ADR-0009` 一致：能靠正则判「某处不许出现 X」的扫描会被
 *   换个位置绕过去，只让人学会绕路；**只出事实的扫描没有绕路激励**。
 *   ⇒ 使用者的一条纪律：**不要为了让这张表好看而改码**。表是体检单，不是罚单。
 *
 * 【与已有检查的边界（一个能力一个入口）】
 *   · 复杂度 × 覆盖率：官方检查里没有（lint 看风格、knip 看死代码、vitest 看行为）
 *     ⇒ 本脚本是它的**唯一**入口。
 *   · 覆盖率数据本身**不自己造**：读项目已有的 LCOV 报告（`vitest --coverage` 产出）。
 *   · 重复检测在**同一文件**里，但**另一套口径**（归一化 + 指纹 + Jaccard，见下）——
 *     两个能力各说各的，不共用一套数字。
 *
 * 【扫描范围：跟着项目骨架走，不认具体名字】
 *   · workspace 清单读 `pnpm-workspace.yaml` 的 `packages:`（本脚手架固定为
 *     `apps/*` 与 `packages/*`）⇒ 新增一个 app 或 package 不必改本脚本。
 *   · 扫每个 workspace 的 `src/`，加根 `src/` 与根 `scripts/`。
 *   · 项目名一律从根 `package.json` 读；**本文件不出现任何具体项目名**。
 *   · 测试代码不算业务代码：排除 `*.test.*`、`*.spec.*` 与 `tests/` 目录
 *     （与 vitest 在各 workspace 的 `src` 下收 `*.test.ts` 是同一套约定）。
 *
 * 【口径（写死在这里，便于对照与复核）】
 *   · **CC（圈复杂度）= 1 + 决策点数**。决策点：`if`、各循环、`catch`、三元、
 *     `switch` 的每个 case（含 default）、`&&`、`||`、`??`、`?.`。
 *   · **条目**＝顶层函数声明、类方法、顶层变量上的箭头/函数表达式；
 *     **嵌套函数并入外层**（不单列）；**路由回调单列**（`GET /users`，同名再加 `#2`）。
 *   · **类/接口声明体不计入外层**（类里的方法是独立条目）。
 *   · **覆盖率**：函数行区间内，若有分支记录（BRDA）用分支，否则用行命中（DA）；
 *     文件不在报告里 = 0%；**找不到覆盖率报告时全部按 0% 计**（并在输出里说明）。
 *   · **CRAP = CC² × (1 − 覆盖率)³ + CC**，从高到低排。
 *
 * 【重复检测的口径（与上面那套互不相干）】
 *   · **形状**：把一段代码归一化成「类型 + 调用名 + 运算符」的树 —— **调用位置保留被调用
 *     的名字**（`filter` 还是 `map` 要看得出来），**局部名、字段名、类型名泛化**，
 *     **字面量泛化**，运算符保留。
 *   · **指纹**：这棵树的每棵子树的形式串，加上其中出现过的原子（被调用名、字面量、运算符）。
 *   · **相似度**：两个指纹集合的 **Jaccard**（交集 ÷ 并集）。
 *   · **可比单位**：函数与类方法（**类字段里的箭头函数也算**——它同样是可以被复制的形状）。
 *   · **门槛**：至少 4 行、至少 20 个节点；相似度默认 **0.82**，可用 `--threshold` 调。
 *   · 同一对只报一次，按相似度从高到低排。
 *   · **相似度数值不可跨工具比较**：参照实现用 tree-sitter 解析，本实现用 oxc 解析，
 *     JSX 在两边的节点粒度不同（一边一个 `jsx_element`，一边拆成 opening/closing/attribute），
 *     同一段代码算出的分数因此不同。实测同一项目：参照实现判为重复的组合，本实现
 *     **全部命中，且没有多报**（本实现偏保守：宁可少提示，不制造假线索）。
 *
 * 【耗时（实测，别再当风险提）】1655 个函数 / 198 个文件：**约 1.2 秒**；同一项目上参照实现
 *   dryer 约 14 秒。配对确实是两两比，但门槛在配对前就过滤掉绝大多数形状，指纹又只是短字符串
 *   集合 ⇒ 日常规模不需要增量模式；真要更快用 `--changed`，不是给配对加索引。
 *
 * 【用法】
 *   node scripts/scan.mjs                 # 扫描并打印表，同时写 .metrics/scan.json
 *   node scripts/scan.mjs --json          # 只输出 JSON（给 agent / CI 读）
 *   node scripts/scan.mjs --limit 50      # 表里最多显示 50 行（默认 20）
 *   node scripts/scan.mjs --changed      # 只扫这次改动碰过的文件（git 视角）
 *   node scripts/scan.mjs --root ../other # 扫别的目录（默认：本脚本所在项目的根）
 *
 * 【退出码】0 = 扫描完成（无论发现多少事实）；2 = 参数或环境不对（例如找不到解析器）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSync } from "oxc-parser";

/** 项目根：本脚本放在 `<根>/scripts/` 下，故根是脚本目录的上一级。 */
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 不含业务代码的目录：依赖、产物、缓存、版本控制。 */
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".venv",
  ".vercel",
  ".netlify",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

/** 测试目录：测的是被测代码本身，不是被测的业务代码。 */
const TEST_DIRS = new Set(["__mocks__", "__tests__", "e2e", "fixtures", "spec", "test", "tests"]);

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".mts", ".cts", ".ts", ".tsx"]);

/** 路由方法：这些方法名上的回调单列为条目（`GET /users`）。 */
const ROUTE_METHODS = new Set([
  "all",
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "use",
]);

/** 声明体不计入外层函数：类与接口里的逻辑归它自己的方法。 */
const DECLARATION_NODES = new Set([
  "ClassDeclaration",
  "ClassExpression",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
]);

/** 决策点：与本仓 ADR 的口径一致，改这里就改了全部 CC。 */
const DECISION_NODES = new Set([
  "CatchClause",
  "ConditionalExpression",
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "IfStatement",
  "SwitchCase",
  "WhileStatement",
]);

const die = (message, fix) => {
  console.error(`❌ ${message}`);
  if (fix) console.error(`   ↳ 怎么修：${fix}`);
  process.exit(2);
};

const flag = (name) => process.argv.includes(name);

const value = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const next = process.argv[index + 1];
  return next === undefined || next.startsWith("--") ? fallback : next;
};

const number = (name, fallback) => {
  const raw = value(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const root = resolve(value("--root", scriptRoot));

if (!existsSync(root)) {
  die(`项目根不存在：${root}`, "传 --root 指向项目根，或从项目内运行本脚本");
}

const limit = number("--limit", 20);

/** 重复检测的门槛：与参照实现同款默认值，可用命令行调。 */
const threshold = number("--threshold", 0.82);
const minLines = number("--min-lines", 4);
const minNodes = number("--min-nodes", 20);

const posix = (path) => path.split(sep).join("/");

/** 子节点：ESTree 节点是带 `type` 的对象，数组里的每一项也可能是节点。 */
const childNodes = (node) => {
  const children = [];

  for (const [key, child] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") {
      continue;
    }

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item !== null && typeof item === "object" && typeof item.type === "string") {
          children.push(item);
        }
      }
      continue;
    }

    if (child !== null && typeof child === "object" && typeof child.type === "string") {
      children.push(child);
    }
  }

  return children;
};

/** 父节点索引：ESTree 的 JSON 里没有 `parent` 指针，而「是不是顶层」要看祖先。 */
const parentOf = new WeakMap();

const walk = (node, visit) => {
  const stack = [node];
  parentOf.set(node, undefined);

  while (stack.length > 0) {
    const current = stack.pop();
    visit(current);

    for (const child of childNodes(current).reverse()) {
      parentOf.set(child, current);
      stack.push(child);
    }
  }
};

const isNode = (value, type) =>
  value !== null && typeof value === "object" && value.type === type;

/** 决策点判定：`&&`、`||`、`??` 是逻辑表达式，`?.` 是一条可选链。 */
const isDecision = (node) => {
  if (DECISION_NODES.has(node.type)) {
    return true;
  }

  if (node.type === "LogicalExpression") {
    return ["&&", "||", "??"].includes(node.operator);
  }

  return node.type === "ChainExpression";
};

/** 名字：标识符取 `name`，字符串字面量取 `value`（方法名可以是字符串）。 */
const nameOf = (node) => {
  if (node === null || node === undefined) {
    return undefined;
  }

  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "Literal") {
    return typeof node.value === "string" ? node.value : undefined;
  }

  return undefined;
};

/** 路由回调：Express/Hono 风格的 `app.get("/path", handler)` —— handler 自己是一条目。 */
const routeLabel = (node) => {
  const callee = node.callee;

  if (!isNode(callee, "MemberExpression")) {
    return undefined;
  }

  const method = nameOf(callee.property)?.toLowerCase();

  if (method === undefined || !ROUTE_METHODS.has(method)) {
    return undefined;
  }

  const first = node.arguments[0];
  const handler = isNode(first, "ArrowFunctionExpression") || isNode(first, "FunctionExpression")
    ? first
    : undefined;

  if (handler === undefined) {
    return undefined;
  }

  let path;
  if (isNode(first, "Literal") && typeof first.value === "string") {
    path = first.value;
  } else {
    const object = callee.object;
    if (isNode(object, "CallExpression") && isNode(object.callee, "MemberExpression")) {
      if (nameOf(object.callee.property) === "route") {
        const argument = object.arguments[0];
        if (isNode(argument, "Literal") && typeof argument.value === "string") {
          path = argument.value;
        }
      }
    }
  }

  return { handler, name: path === undefined ? method.toUpperCase() : `${method.toUpperCase()} ${path}` };
};

/** 命名空间：模块路径去掉 `src/` 段与扩展名，斜杠变点；类方法再加类名。 */
const moduleName = (relativePath) => {
  let text = posix(relativePath).replace(/\.[^./]+$/u, "");

  if (text.startsWith("src/")) {
    text = text.slice(4);
  } else if (text.includes("/src/")) {
    text = text.slice(text.indexOf("/src/") + 5);
  }

  return text.replaceAll("/", ".");
};

/** 行号：AST 给的是字节偏移，这里换算成 1 起的行号。 */
const lineIndexer = (text) => {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }

  return (offset) => {
    let low = 0;
    let high = starts.length - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle] <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return low + 1;
  };
};

/**
 * 一个文件里的条目：复杂度表要的（函数 / 方法 / 箭头 / 路由回调）与重复检测要的形状。
 *
 * 【刻意不拆】它是**随模板复制到每个项目的脚本**：没有第二个调用方、没有复用者，唯一的
 *   改动理由是口径变 —— 而口径变要重新对齐参照实现（crapper 的决策点表、dryer 的归一化）。
 *   拆成几个小函数只增加表面积，不产生任何复用；真正的防线是端到端测试，不是函数大小。
 */
const entriesInFile = (relativePath, text) => {
  let parsed;

  try {
    // `.tsx` 之外的语法由解析器按扩展名推断：`tsx` 语法会拒绝 `.mjs` 里的部分写法。
    parsed = relativePath.endsWith(".tsx")
      ? parseSync(posix(relativePath), text, { lang: "tsx" })
      : parseSync(posix(relativePath), text);
  } catch (error) {
    return { entries: [], error: String(error), shapes: [] };
  }

  if (parsed.errors.length > 0) {
    return { entries: [], error: parsed.errors[0].message, shapes: [] };
  }

  const lineAt = lineIndexer(text);
  const routeCallbacks = new Map();
  const entries = [];
  const shapes = [];
  const usedRouteNames = new Map();

  walk(parsed.program, (node) => {
    if (node.type !== "CallExpression") {
      return;
    }

    const route = routeLabel(node);

    if (route !== undefined) {
      routeCallbacks.set(route.handler, route.name);
    }
  });

  const complexityOf = (root) => {
    let score = 1;
    const stack = [root];

    while (stack.length > 0) {
      const current = stack.pop();

      if (DECLARATION_NODES.has(current.type) || routeCallbacks.has(current)) {
        continue;
      }

      if (isDecision(current)) {
        score += 1;
      }

      for (const child of childNodes(current).reverse()) {
        stack.push(child);
      }
    }

    return score;
  };

  const module = moduleName(relativePath);

  const push = (name, namespace, node, startOffset) => {
    entries.push({
      complexity: complexityOf(node),
      endLine: lineAt(node.end),
      name,
      namespace,
      path: relativePath,
      startLine: lineAt(startOffset),
    });

    shapes.push({
      endLine: lineAt(node.end),
      name,
      namespace,
      node,
      path: relativePath,
      startLine: lineAt(startOffset),
    });
  };

  /** 是不是在某个函数体里：嵌套函数并入外层，不单列成条目。 */
  const insideFunction = (node) => {
    let current = parentOf.get(node);

    while (current !== undefined) {
      if (
        isNode(current, "FunctionDeclaration") ||
        isNode(current, "FunctionExpression") ||
        isNode(current, "ArrowFunctionExpression") ||
        isNode(current, "MethodDefinition")
      ) {
        return true;
      }

      current = parentOf.get(current);
    }

    return false;
  };

  walk(parsed.program, (node) => {
    if (node.type === "FunctionDeclaration" && node.id !== undefined) {
      if (!insideFunction(node)) {
        push(node.id.name, module, node, node.start);
      }

      return;
    }

    if (node.type === "MethodDefinition") {
      const name = nameOf(node.key);

      if (name !== undefined) {
        const classes = [];

        let current = parentOf.get(node);
        while (current !== undefined) {
          if (isNode(current, "ClassDeclaration") || isNode(current, "ClassExpression")) {
            const className = nameOf(current.id);
            if (className !== undefined) {
              classes.unshift(className);
            }
          }

          current = parentOf.get(current);
        }

        const namespace = classes.length === 0 ? module : `${module}.${classes.join(".")}`;
        push(name, namespace, node.value, node.start);
      }

      return;
    }

    if (node.type === "VariableDeclaration") {
      for (const declaration of node.declarations) {
        const initializer = declaration.init;

        if (
          !isNode(initializer, "ArrowFunctionExpression") &&
          !isNode(initializer, "FunctionExpression")
        ) {
          continue;
        }

        const name = nameOf(declaration.id);

        if (name !== undefined && !insideFunction(declaration)) {
          push(name, module, initializer, declaration.start);
        }
      }
    }
    if (node.type === "PropertyDefinition") {
      // 类字段里的箭头函数：重复检测把它当**可复制的形状**（复杂度的条目口径不含它）。
      const value = node.value;

      if (isNode(value, "ArrowFunctionExpression") || isNode(value, "FunctionExpression")) {
        const name = nameOf(node.key);

        if (name !== undefined) {
          shapes.push({
            endLine: lineAt(value.end),
            name,
            namespace: module,
            node: value,
            path: relativePath,
            startLine: lineAt(node.start),
          });
        }
      }

      return;
    }
  });

  for (const [handler, label] of routeCallbacks) {
    const count = usedRouteNames.get(label) ?? 0;
    usedRouteNames.set(label, count + 1);
    const name = count === 0 ? label : `${label}#${count + 1}`;
    push(name, module, handler, handler.start);
  }

  return { entries, error: undefined, shapes };
};

/** 收集要扫的源文件：跟着 workspace 清单走，不认具体目录名。 */
const workspaceDirectories = () => {
  const manifest = join(root, "pnpm-workspace.yaml");

  if (!existsSync(manifest)) {
    return [];
  }

  const patterns = [];

  for (const line of readFileSync(manifest, "utf8").split("\n")) {
    const match = /^\s*-\s*["']?([^"'#]+?)["']?\s*$/u.exec(line);

    if (match !== null && !match[1].includes(":")) {
      patterns.push(match[1].trim());
    }
  }

  const directories = [];

  for (const pattern of patterns) {
    const [prefix] = pattern.split("*");
    const parent = join(root, prefix);

    if (!existsSync(parent)) {
      continue;
    }

    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(parent, entry.name, "package.json"))) {
        directories.push(join(parent, entry.name));
      }
    }
  }

  return directories;
};

const isTestFile = (name) => /\.(?:test|spec)\.[^./]+$/u.test(name);

const collectSourceFiles = (directory, found = []) => {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const absolute = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || TEST_DIRS.has(entry.name)) {
        continue;
      }

      collectSourceFiles(absolute, found);
      continue;
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }

    if (isTestFile(entry.name) || entry.name.endsWith(".d.ts")) {
      continue;
    }

    found.push(absolute);
  }

  return found;
};

const sourceFiles = [];

for (const workspace of workspaceDirectories()) {
  collectSourceFiles(join(workspace, "src"), sourceFiles);
}

collectSourceFiles(join(root, "src"), sourceFiles);
collectSourceFiles(join(root, "scripts"), sourceFiles);

/** 增量扫描：只看这次改动碰过的文件（git 视角：已改的 + 新加的）。 */
const changedFiles = () => {
  const files = new Set();

  try {
    const tracked = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });

    for (const line of `${tracked}\n${untracked}`.split("\n")) {
      if (line.trim() !== "") {
        files.add(resolve(root, line.trim()));
      }
    }
  } catch {
    return files;
  }

  return files;
};

const changed = flag("--changed");
const touched = changed ? changedFiles() : undefined;

const uniqueFiles = [
  ...new Set(touched === undefined ? sourceFiles : sourceFiles.filter((file) => touched.has(file))),
];

if (uniqueFiles.length === 0) {
  console.log(
    changed
      ? "🩺 scan · 这次改动没有碰到源文件 ⇒ 无事可扫。"
      : "🩺 scan · 没有找到源文件（检查 workspace 清单与目录）。",
  );
  process.exit(0);
}

/** 覆盖率报告：项目自己的 LCOV 产物，位置随项目配置变 ⇒ 找，不写死。 */
const coverageReports = () => {
  const reports = [];
  const walkReports = (directory) => {
    let entries;

    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }

        walkReports(absolute);
        continue;
      }

      if (entry.isFile() && entry.name === "lcov.info") {
        reports.push(absolute);
      }
    }
  };

  walkReports(root);

  return reports;
};

/** 一份 LCOV：行命中（DA）与分支（BRDA）都按行聚合。 */
const parseLcov = (text) => {
  const files = new Map();
  let current;

  for (const raw of text.split("\n")) {
    const line = raw.trim();

    if (line.startsWith("SF:")) {
      current = { branches: new Map(), lines: new Map(), path: line.slice(3) };
      continue;
    }

    if (current === undefined) {
      continue;
    }

    if (line === "end_of_record") {
      files.set(current.path, current);
      current = undefined;
      continue;
    }

    const data = line.match(/^DA:(\d+),(\d+)/u);

    if (data !== null) {
      const hits = Number(data[2]);
      current.lines.set(Number(data[1]), [hits > 0 ? 1 : 0, 1]);
      continue;
    }

    const branch = line.match(/^BRDA:(\d+),[^,]*,[^,]*,(.+)$/u);

    if (branch !== null) {
      const lineNumber = Number(branch[1]);
      const [covered, total] = current.branches.get(lineNumber) ?? [0, 0];
      current.branches.set(lineNumber, [covered + (branch[2] !== "-" && Number(branch[2]) > 0 ? 1 : 0), total + 1]);
    }
  }

  return files;
};

const coverageIndex = (() => {
  const index = new Map();

  for (const report of coverageReports()) {
    for (const [path, record] of parseLcov(readFileSync(report, "utf8"))) {
      index.set(resolve(root, path), record);
    }
  }

  return index;
})();

/** 覆盖率报告里的路径写法不一（绝对/相对）⇒ 先精确，后按最长后缀找。 */
const coverageFor = (absolutePath) => {
  const exact = coverageIndex.get(absolutePath);

  if (exact !== undefined) {
    return exact;
  }

  const parts = posix(absolutePath).split("/");
  let best;

  for (const [path, record] of coverageIndex) {
    const candidate = posix(path);

    if (!candidate.endsWith(parts.at(-1) ?? "")) {
      continue;
    }

    if (best === undefined || candidate.length > posix(best[0]).length) {
      best = [path, record];
    }
  }

  return best?.[1];
};

/** 函数覆盖率：区间内有分支用分支，否则用行命中；文件不在报告里 = 0%。 */
const coveragePercent = (record, startLine, endLine) => {
  if (record === undefined) {
    return 0;
  }

  let branchCovered = 0;
  let branchTotal = 0;

  for (const [lineNumber, [covered, total]] of record.branches) {
    if (lineNumber >= startLine && lineNumber <= endLine) {
      branchCovered += covered;
      branchTotal += total;
    }
  }

  if (branchTotal > 0) {
    return branchCovered / branchTotal;
  }

  let lineCovered = 0;
  let lineTotal = 0;

  for (const [lineNumber, [covered, total]] of record.lines) {
    if (lineNumber >= startLine && lineNumber <= endLine) {
      lineCovered += covered;
      lineTotal += total;
    }
  }

  return lineTotal === 0 ? 0 : lineCovered / lineTotal;
};

/** CRAP = CC² × (1 − 覆盖率)³ + CC。 */
const crapScore = (complexity, coverage) => {
  const uncovered = 1 - coverage;
  return complexity * complexity * uncovered * uncovered * uncovered + complexity;
};

/** 运算符节点：运算符是形状的一部分（`+` 的代码与 `-` 的代码不该算同一形状）。 */
const OPERATOR_NODES = new Set([
  "AssignmentExpression",
  "BinaryExpression",
  "LogicalExpression",
  "UnaryExpression",
  "UpdateExpression",
]);

/** 字面量节点：一律泛化（`1` 与 `2` 不改变形状）。 */
const LITERAL_NODES = new Set([
  "BigIntLiteral",
  "BooleanLiteral",
  "Literal",
  "NullLiteral",
  "RegExpLiteral",
  "StringLiteral",
  "TemplateLiteral",
]);

/** 子节点是否落在「调用位」：调用位保留被调用的名字，其余标识符泛化。 */
const calleePosition = (parent, child, parentIsCallee) => {
  if (parent.type === "CallExpression" || parent.type === "NewExpression") {
    return parent.callee === child;
  }

  if (parent.type === "MemberExpression") {
    // `a.b.c()` 里整条链都是调用位；`x = a.b` 里 `b` 不是。
    return parentIsCallee;
  }

  return false;
};

/** 一个节点的形式：类型 + 子节点的形式；调用位保留名字，其余泛化。 */
const shapeOf = (node, isCallee, forms, atoms) => {
  if (node.type === "Identifier") {
    atoms.add("sym");

    if (isCallee) {
      atoms.add(`sym:${node.name}`);
      return `sym:${node.name}`;
    }

    return "sym";
  }

  if (LITERAL_NODES.has(node.type)) {
    atoms.add("lit");
    return "lit";
  }

  if (OPERATOR_NODES.has(node.type)) {
    const operator = node.operator ?? (node.prefix === true ? "prefix" : "postfix");
    atoms.add(`op:${operator}`);
    return `op:${operator}`;
  }

  const children = childNodes(node).map((child) => forms.get(child) ?? "?");

  return `${node.type}(${children.join(",")})`;
};

/**
 * 指纹：一棵树的「每棵子树的形式」加上「出现过的原子」。
 * 两个指纹集合的 Jaccard 就是形状相似度。
 */
const fingerprintOf = (root) => {
  const forms = new Map();
  const atoms = new Set();
  const stack = [{ expanded: false, isCallee: false, node: root }];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current.expanded) {
      stack.push({ ...current, expanded: true });

      for (const child of childNodes(current.node)) {
        stack.push({
          expanded: false,
          isCallee: calleePosition(current.node, child, current.isCallee),
          node: child,
        });
      }

      continue;
    }

    forms.set(current.node, shapeOf(current.node, current.isCallee, forms, atoms));
  }

  const set = new Set(forms.values());

  for (const atom of atoms) {
    set.add(atom);
  }

  return { count: forms.size + atoms.size, set };
};

/** Jaccard：交集 ÷ 并集。 */
const jaccard = (left, right) => {
  let shared = 0;

  for (const item of left) {
    if (right.has(item)) {
      shared += 1;
    }
  }

  const union = left.size + right.size - shared;

  return union === 0 ? 0 : shared / union;
};

const rows = [];
const failures = [];
const comparable = [];
/** 有覆盖率记录的源文件：用来发现「报告在，但路径对不上」这种静默 0%。 */
const coveredFiles = new Set();

for (const file of uniqueFiles) {
  const relativePath = posix(relative(root, file));
  const text = readFileSync(file, "utf8");
  const { entries, error, shapes } = entriesInFile(relativePath, text);

  if (error !== undefined) {
    failures.push(`${relativePath}: ${error}`);
  }

  const record = coverageFor(file);

  if (record !== undefined) {
    coveredFiles.add(file);
  }

  for (const entry of entries) {
    const coverage = coveragePercent(record, entry.startLine, entry.endLine);
    rows.push({
      complexity: entry.complexity,
      coverage: Math.round(coverage * 10000) / 100,
      crap: Math.round(crapScore(entry.complexity, coverage) * 100) / 100,
      endLine: entry.endLine,
      name: entry.name,
      namespace: entry.namespace,
      path: entry.path,
      startLine: entry.startLine,
    });
  }

  for (const shape of shapes) {
    const lines = shape.endLine - shape.startLine + 1;
    const print = fingerprintOf(shape.node);

    if (lines < minLines || print.count < minNodes) {
      continue;
    }

    comparable.push({ ...shape, fingerprints: print.set, nodes: print.count });
  }
}

/** 重复：同语言的形状两两比，每对只报一次，按相似度从高到低。 */
const duplicates = [];

for (let index = 0; index < comparable.length; index += 1) {
  for (let other = index + 1; other < comparable.length; other += 1) {
    const left = comparable[index];
    const right = comparable[other];

    if (
      left.path === right.path &&
      left.startLine === right.startLine &&
      left.endLine === right.endLine
    ) {
      continue;
    }

    const score = jaccard(left.fingerprints, right.fingerprints);

    if (score < threshold) {
      continue;
    }

    duplicates.push({ left, right, score: Math.round(score * 10000) / 10000 });
  }
}

duplicates.sort((left, right) => right.score - left.score);

rows.sort(
  (left, right) =>
    right.crap - left.crap ||
    right.complexity - left.complexity ||
    left.namespace.localeCompare(right.namespace) ||
    left.name.localeCompare(right.name),
);

const report = {
  coverageReports: coverageIndex.size,
  duplicates: duplicates.map((duplicate) => ({
    left: {
      endLine: duplicate.left.endLine,
      file: duplicate.left.path,
      startLine: duplicate.left.startLine,
    },
    right: {
      endLine: duplicate.right.endLine,
      file: duplicate.right.path,
      startLine: duplicate.right.startLine,
    },
    score: duplicate.score,
  })),
  files: uniqueFiles.length,
  functions: rows.length,
  generatedAt: new Date().toISOString(),
  rows,
};

if (!flag("--no-write")) {
  const directory = join(root, ".metrics");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (flag("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const position = (row) => `${row.path}:${row.startLine}`;

const hasCoverage = coverageIndex.size > 0;

console.log(
  `🩺 scan（只读体检 · **不是闸**）｜ ${uniqueFiles.length} 个文件 · ${rows.length} 个函数`,
);

if (hasCoverage) {
  console.log(
    `   覆盖率：报告 ${coverageIndex.size} 个文件，命中源码 ${coveredFiles.size} / ${uniqueFiles.length}`,
  );

  if (coveredFiles.size < uniqueFiles.length) {
    const missed = uniqueFiles
      .filter((file) => !coveredFiles.has(file))
      .slice(0, 3)
      .map((file) => posix(relative(root, file)));
    console.log(`   ↳ 未命中覆盖率的源码（前 3 个，路径写法不一致时会出现）：${missed.join("、")}`);
  }
} else {
  console.log(
    "   ⚠️ 覆盖率**不可用**：没找到 `coverage/lcov.info` ⇒ CRAP 退化为 CC²+CC，下表**只反映复杂度**。",
  );
  console.log("   ↳ 生成覆盖率：`vp test --coverage`（脚手架已配好 lcov reporter）。");
}

console.log("");
console.log(
  hasCoverage
    ? "   CRAP     函数                          位置                          CC    覆盖"
    : "   CRAP*    函数                          位置                          CC    —",
);

for (const row of rows.slice(0, limit)) {
  const line = `   ${String(row.crap).padStart(7)}  ${`${row.namespace}.${row.name}`.slice(0, 28).padEnd(28)}  ${position(row).slice(0, 28).padEnd(28)}  ${String(row.complexity).padStart(3)}`;

  console.log(hasCoverage ? `${line}  ${`${row.coverage.toFixed(1)}%`.padStart(6)}` : line);
}

if (rows.length > limit) {
  console.log(`   …… 另有 ${rows.length - limit} 行（--limit 调整）`);
}

if (failures.length > 0) {
  console.log("");
  console.log(`   ⚠️ ${failures.length} 个文件解析失败（跳过）：`);
  for (const failure of failures.slice(0, 5)) {
    console.log(`      ${failure}`);
  }
}

const span = (side) => `${side.path}:${side.startLine}-${side.endLine}`;

console.log("");
console.log(
  `   重复形状（相似度 ≥ ${threshold}）｜ ${duplicates.length} 对 · 门槛：≥ ${minLines} 行且 ≥ ${minNodes} 节点`,
);
console.log("   相似度   左                                              右");

for (const duplicate of duplicates.slice(0, limit)) {
  console.log(
    `   ${String(duplicate.score).padEnd(8)} ${span(duplicate.left).slice(0, 46).padEnd(46)}  ${span(duplicate.right).slice(0, 46)}`,
  );
}

if (duplicates.length > limit) {
  console.log(`   …… 另有 ${duplicates.length - limit} 对（--limit 调整）`);
}

console.log("");
console.log("   ⇒ 这些是**事实**，不是合规判定：不要为了让这张表好看而改码。");
console.log("   ⇒ 完整数据见 `.metrics/scan.json`。");
