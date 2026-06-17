import fs from "node:fs";
import path from "node:path";

export const BASELINE_PATH = path.join(
  "governance",
  "file-size-baseline.json",
);

export const DEFAULT_BASELINE = {
  generatedAt: "",
  policy:
    "Prevents code bloat. Existing oversized files may only shrink (±5% tolerance). New files must not exceed 800 lines. Generated code (protocol.generated.ts etc.) is exempt. See AGENTS.md § 基础约束 3 and internal/refactor/progressive-refactor-plan.md R-60.",
  frontend: {
    scanPaths: ["src/**/*.ts", "src/**/*.tsx"],
    excludePatterns: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.d.ts",
      "**/*.testFixtures.tsx",
      "**/*.test/**",
    ],
    oversizedFrozen: [],
  },
  rust: {
    scanPaths: ["lime-rs/crates/**/*.rs"],
    excludePatterns: [
      "**/*_test.rs",
      "**/*_tests.rs",
      "**/tests/**",
      "**/tests.rs",
    ],
    oversizedFrozen: [],
  },
  thresholds: {
    newFileMax: 800,
    frozenTolerance: 0.05,
  },
};

export function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`❌ 基线文件不存在: ${BASELINE_PATH}`);
    console.error(
      "   请先运行 npm run governance:file-size:update 生成基线。",
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(BASELINE_PATH, "utf8");
  return JSON.parse(raw);
}

export function writeBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(baseline, null, 2)}\n`,
    "utf8",
  );
}

export function isGenerated(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const head = content.split(/\r?\n/).slice(0, 5).join("\n");
    return head.includes("@generated");
  } catch {
    return false;
  }
}

export function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).length;
}

export function shouldExclude(filePath, excludePatterns) {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const basename = segments[segments.length - 1] ?? normalized;

  return excludePatterns.some((pattern) => {
    if (pattern === "**/tests/**") {
      return segments.includes("tests");
    }
    if (pattern === "**/*.test/**") {
      return segments.some((segment) => segment.endsWith(".test"));
    }
    if (pattern === "**/tests.rs") {
      return basename === "tests.rs";
    }
    if (pattern.startsWith("**/*")) {
      return basename.endsWith(pattern.slice("**/*".length));
    }
    if (pattern.startsWith("**/")) {
      return normalized.endsWith(pattern.slice("**/".length));
    }
    return basename === pattern;
  });
}

export function scanFiles(scanPaths, excludePatterns) {
  const allFiles = new Set();
  for (const pattern of scanPaths) {
    const rootDir = pattern.split("**")[0].replace(/\/$/u, "");
    const extension = pattern.endsWith("*.tsx")
      ? ".tsx"
      : pattern.endsWith("*.ts")
        ? ".ts"
        : pattern.endsWith("*.rs")
          ? ".rs"
          : "";
    if (!rootDir || !extension || !fs.existsSync(rootDir)) {
      continue;
    }
    walkFiles(rootDir, extension, excludePatterns, allFiles);
  }
  return [...allFiles].sort();
}

function walkFiles(currentDir, extension, excludePatterns, allFiles) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "target" ||
      entry.name === "dist"
    ) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    const normalized = fullPath.replace(/\\/g, "/");
    if (entry.isDirectory()) {
      walkFiles(fullPath, extension, excludePatterns, allFiles);
      continue;
    }
    if (
      entry.isFile() &&
      normalized.endsWith(extension) &&
      !shouldExclude(normalized, excludePatterns)
    ) {
      allFiles.add(normalized);
    }
  }
}

export function collectOversizedFiles(config, thresholds) {
  const files = scanFiles(config.scanPaths, config.excludePatterns ?? []);
  return files
    .filter((filePath) => !isGenerated(filePath))
    .map((filePath) => ({
      path: filePath,
      lines: countLines(filePath),
    }))
    .filter((entry) => entry.lines > thresholds.newFileMax)
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
}
