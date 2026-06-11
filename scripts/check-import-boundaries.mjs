#!/usr/bin/env node
/**
 * Import 边界守卫（R-30）
 *
 * 规则：
 *   - src/lib/** 禁止 import @/components/** 和 @/features/**
 *   - src/features/** 禁止 import @/components/**
 *
 * 存量违例记录在 governance/import-boundary-baseline.json，只许减不许增。
 * 新增违例会导致 CI 失败。
 *
 * 用法：
 *   node scripts/check-import-boundaries.mjs
 */

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const BASELINE_PATH = path.join(
  REPO_ROOT,
  "governance/import-boundary-baseline.json",
);

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { violations: [] };
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function scanTsFiles(dir) {
  const results = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

function extractImports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const imports = [];
  // 匹配 from "@/..." 和 from "..." 的 import 语句
  const importRegex = /from\s+["']([^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function checkBoundaries() {
  const baseline = readBaseline();
  const baselineSet = new Set(
    baseline.violations.map((v) => `${v.file}|${v.import}`),
  );

  const violations = [];

  // 检查 src/lib/** → @/components/** 和 @/features/**
  const libFiles = scanTsFiles(path.join(REPO_ROOT, "src/lib"));
  for (const file of libFiles) {
    const relativeFile = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    const imports = extractImports(file);
    for (const imp of imports) {
      if (imp.startsWith("@/components/") || imp.startsWith("@/features/")) {
        violations.push({
          file: relativeFile,
          import: imp,
          rule: imp.startsWith("@/components/") ? "lib→components" : "lib→features",
        });
      }
    }
  }

  // 检查 src/features/** → @/components/**
  const featureFiles = scanTsFiles(path.join(REPO_ROOT, "src/features"));
  for (const file of featureFiles) {
    const relativeFile = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    const imports = extractImports(file);
    for (const imp of imports) {
      if (imp.startsWith("@/components/")) {
        violations.push({
          file: relativeFile,
          import: imp,
          rule: "features→components",
        });
      }
    }
  }

  // R-40：检查 src/components/**、src/hooks/** → @/lib/dev-bridge/**
  for (const dir of ["src/components", "src/hooks"]) {
    const files = scanTsFiles(path.join(REPO_ROOT, dir));
    for (const file of files) {
      const relativeFile = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
      if (relativeFile.includes(".test.")) continue;
      const imports = extractImports(file);
      for (const imp of imports) {
        if (imp.startsWith("@/lib/dev-bridge")) {
          violations.push({
            file: relativeFile,
            import: imp,
            rule: "business→dev-bridge",
          });
        }
      }
    }
  }

  // 比较：找出新增违例
  const newViolations = violations.filter(
    (v) => !baselineSet.has(`${v.file}|${v.import}`),
  );

  // 检查：baseline 中的违例是否已修复（只减不增）
  const currentSet = new Set(violations.map((v) => `${v.file}|${v.import}`));
  const fixedCount = baseline.violations.filter(
    (v) => !currentSet.has(`${v.file}|${v.import}`),
  ).length;

  // 输出
  if (newViolations.length > 0) {
    console.error(
      `\n❌ 发现 ${newViolations.length} 处新增 import 边界违例：\n`,
    );
    for (const v of newViolations) {
      console.error(`  ${v.file}`);
      console.error(`    import ${v.import}  [${v.rule}]`);
    }
    console.error(`\nbaseline 中有 ${baseline.violations.length} 处存量违例。`);
    console.error(
      "新增违例不允许。请重构为正向依赖，或联系团队评估后加入 baseline。",
    );
    console.error(
      "规格：internal/refactor/progressive-refactor-plan.md R-30",
    );
    process.exit(1);
  }

  console.log(
    `✅ import 边界治理通过。（${baseline.violations.length} 处存量违例，${fixedCount} 处已修复，${newViolations.length} 处新增）`,
  );
}

checkBoundaries();
