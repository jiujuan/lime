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

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASELINE_PATH = path.join(
  "governance",
  "file-size-baseline.json",
);

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`❌ 基线文件不存在: ${BASELINE_PATH}`);
    console.error("   请先运行 node -e \"...\" 生成基线（见 internal/refactor/file-size-ratchet-guard-spec.md）");
    process.exit(1);
  }
  const raw = fs.readFileSync(BASELINE_PATH, "utf8");
  return JSON.parse(raw);
}

function isGenerated(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    // 检查前 5 行是否有 @generated 标记
    const head = content.split(/\r?\n/).slice(0, 5).join("\n");
    return head.includes("@generated");
  } catch {
    return false;
  }
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).length;
}

function shouldExclude(filePath, excludePatterns) {
  const basename = path.basename(filePath);
  return excludePatterns.some((p) => {
    // 原始模式中的 / 分隔符暗示路径匹配
    const hasSlash = p.replace(/\*\*/g, "").includes("/");
    // 将 glob 模式简化为子串/后缀匹配
    const clean = p.replace(/\*\*/g, "").replace(/^\//g, "").replace(/\/$/g, "");
    if (clean.startsWith("*.")) {
      // 通配后缀：*.test.ts → 检查文件名是否以 .test.ts 结尾
      return basename.endsWith(clean.slice(1));
    }
    if (clean.startsWith("*")) {
      // 通配后缀：*_test.rs → 检查文件名是否以 _test.rs 结尾
      return basename.endsWith(clean.slice(1));
    }
    if (hasSlash) {
      // 路径段模式（原模式含 /）：如 **/tests/** → 检查路径含 /tests/
      return filePath.includes("/" + clean + "/") || filePath.includes("/" + clean + ".");
    }
    // 精确文件名：tests.rs → 检查文件名
    if (clean.includes(".")) {
      return basename === clean;
    }
    return false;
  });
}

function scanFiles(scanPaths, excludePatterns) {
  const allFiles = new Set();
  for (const pattern of scanPaths) {
    try {
      // 使用 find 扫描（排除 node_modules 和 target）
      const [dir, ...rest] = pattern.split("/");
      const ext = rest[rest.length - 1]; // *.ts / *.tsx / *.rs
      const cmd = `find ${dir} -name "${ext}" -type f -not -path "*/node_modules/*" -not -path "*/target/*"`;
      const output = execFileSync("sh", ["-c", cmd], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const file of output.split(/\r?\n/).filter(Boolean)) {
        const normalized = file.replace(/\\/g, "/");
        if (!shouldExclude(normalized, excludePatterns)) {
          allFiles.add(normalized);
        }
      }
    } catch {
      // find 可能失败，继续
    }
  }
  return [...allFiles];
}

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
    console.log("✅ 文件体量治理通过。");
  }
}

main();
