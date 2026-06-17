/**
 * 文件体量棘轮守卫
 *
 * 规则（参照 internal/refactor/progressive-refactor-plan.md R-60）：
 *   1. 已在基线中的超线文件只许变小（±5% 容差，避免格式化/注释导致误报）
 *   2. 新文件不许超 800 行（AGENTS.md 基础约束 3 预警线）
 *   3. 生成代码（头部有 // @generated 标记）豁免
 *
 * 基线：governance/file-size-baseline.json
 * 规格：internal/refactor/file-size-ratchet-guard-spec.md
 */

import {
  collectOversizedFiles,
  countLines,
  isGenerated,
  readBaseline,
  scanFiles,
} from "./governance/file-size-baseline-lib.mjs";

function checkFile(file, frozenMap, thresholds) {
  if (isGenerated(file.path)) {
    return null; // 生成代码豁免
  }

  const frozen = frozenMap.get(file.path);

  if (frozen) {
    // 已在基线：只能变小或在容差内
    const baselineLines = frozen.lines;
    const tolerance = Math.ceil(baselineLines * thresholds.frozenTolerance);
    if (file.lines > baselineLines + tolerance) {
      return {
        path: file.path,
        issue: "oversized_file_grew",
        baseline: baselineLines,
        current: file.lines,
        allowed: baselineLines + tolerance,
      };
    }
  } else {
    // 新文件：不许超阈值
    if (file.lines > thresholds.newFileMax) {
      return {
        path: file.path,
        issue: "new_file_exceeds_threshold",
        current: file.lines,
        threshold: thresholds.newFileMax,
      };
    }
  }

  return null;
}

function main() {
  const baseline = readBaseline();
  const violations = [];

  // 构建 frozen map（按语言）
  const feFrozenMap = new Map(
    (baseline.frontend?.oversizedFrozen || []).map((f) => [f.path, f]),
  );
  const rsFrozenMap = new Map(
    (baseline.rust?.oversizedFrozen || []).map((f) => [f.path, f]),
  );

  // 扫描前端文件
  const feFiles = scanFiles(
    baseline.frontend?.scanPaths || ["src/**/*.ts", "src/**/*.tsx"],
    baseline.frontend?.excludePatterns || [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.d.ts",
      "**/*.test/**",
    ],
  );
  for (const filePath of feFiles) {
    const lines = countLines(filePath);
    const violation = checkFile(
      { path: filePath, lines },
      feFrozenMap,
      baseline.thresholds,
    );
    if (violation) violations.push(violation);
  }

  // 扫描 Rust 文件
  const rsFiles = scanFiles(
    baseline.rust?.scanPaths || ["lime-rs/**/*.rs"],
    baseline.rust?.excludePatterns || [
      "**/*_test.rs",
      "**/*_tests.rs",
      "**/tests/**",
      "**/tests.rs",
    ],
  );
  for (const filePath of rsFiles) {
    const lines = countLines(filePath);
    const violation = checkFile(
      { path: filePath, lines },
      rsFrozenMap,
      baseline.thresholds,
    );
    if (violation) violations.push(violation);
  }

  const currentFrontendOversized = collectOversizedFiles(
    baseline.frontend,
    baseline.thresholds,
  ).length;
  const currentRustOversized = collectOversizedFiles(
    baseline.rust,
    baseline.thresholds,
  ).length;

  // 输出结果
  if (violations.length > 0) {
    console.error(
      `\n❌ 文件体量治理失败（${violations.length} 处违规）:\n`,
    );
    console.error(baseline.policy);
    console.error("");

    for (const v of violations) {
      if (v.issue === "oversized_file_grew") {
        console.error(`  ${v.path}`);
        console.error(
          `    基线: ${v.baseline} 行, 当前: ${v.current} 行`,
        );
        console.error(
          `    允许最大: ${v.allowed} 行（基线 + 5% 容差）`,
        );
        console.error(
          `    ❌ 超线文件增加了 ${v.current - v.baseline} 行。超线文件只许变小。`,
        );
      } else if (v.issue === "new_file_exceeds_threshold") {
        console.error(`  ${v.path}`);
        console.error(
          `    当前: ${v.current} 行, 阈值: ${v.threshold} 行`,
        );
        console.error(
          `    ❌ 新文件不许超过 ${v.threshold} 行。请拆分为更小的模块。`,
        );
      }
      console.error("");
    }

    console.error(
      "提示: 如果你有意拆分了文件，请更新 governance/file-size-baseline.json",
    );
    console.error(
      "规格: internal/refactor/file-size-ratchet-guard-spec.md",
    );
    process.exit(1);
  } else {
    console.log(
      `✅ 文件体量治理通过。（frontend ${currentFrontendOversized}, rust ${currentRustOversized}）`,
    );
  }
}

main();
