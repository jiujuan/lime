import fs from "node:fs";
import path from "node:path";

export const VITEST_LAYER_NAMES = [
  "unit",
  "component",
  "contract",
  "integration",
  "e2e",
];

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;
const EXPLICIT_LAYER_PATTERN =
  /(?:^|[._-])(unit|component|contract|integration|e2e)[._-](?:test|spec)\.(?:[cm]?[jt]sx?)$/i;
const LIVE_TEST_PATTERN =
  /(?:^|[._-])live[._-](?:test|spec)\.(?:[cm]?[jt]sx?)$/i;

const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

const EXCLUDED_PATH_SEGMENTS = [
  "/src-tauri/target/",
  "/tmp/lime-pnpm-frozen-node_modules/",
];

const INTEGRATION_PATTERNS = [
  {
    reason: "name:integration",
    pattern: /\.integration\.(?:test|spec)\./i,
  },
  { reason: "node:fs", pattern: /\bnode:fs\b|from\s+["']fs["']|\bfs\./ },
  {
    reason: "node:child_process",
    pattern:
      /\bnode:child_process\b|from\s+["']child_process["']|\b(execFile|spawn|spawnSync|execSync)\b/,
  },
  { reason: "temp-files", pattern: /\bmkdtemp\b|\btmpdir\b/ },
  {
    reason: "local-server",
    pattern: /\bMockServer\b|\bcreateServer\b|\.listen\s*\(/,
  },
];

const E2E_PATTERNS = [
  {
    reason: "name:e2e",
    pattern: /(?:^|[._-])(?:e2e|smoke)[._-](?:test|spec)\./i,
  },
  {
    reason: "playwright",
    pattern:
      /from\s+["']@playwright\/test["']|from\s+["']playwright["']|require\(\s*["']@playwright\/test["']\s*\)|require\(\s*["']playwright["']\s*\)/,
  },
  {
    reason: "browser-automation",
    pattern:
      /\bchromium\.launch\b|\bbrowser\.newPage\b|\bpage\.goto\b|\bpage\.locator\b/,
  },
];

const NETWORK_INTEGRATION_PATTERNS = [
  {
    reason: "network-surface",
    pattern:
      /\bfetch\s*\(|\bXMLHttpRequest\b|\bEventSource\b|\bWebSocket\b|\bnode:(?:http|https|net|tls)\b|from\s+["'](?:node:)?(?:http|https|net|tls)["']/,
  },
];

const CONTRACT_PATTERNS = [
  { reason: "tauri-api", pattern: /@tauri-apps\/api|__TAURI__/ },
  { reason: "safeInvoke", pattern: /\bsafeInvoke\b|\binvoke\s*\(/ },
  { reason: "dev-bridge", pattern: /\bDevBridge\b|dev-bridge|tauri-mock/ },
  {
    reason: "command-catalog",
    pattern:
      /\bmockPriorityCommands\b|\bdefaultMocks\b|\bagentCommandCatalog\b|\bagentRuntimeCommandSchema\b|\bcheck-command-contracts\b/,
  },
];

const COMPONENT_PATTERNS = [
  { reason: "react-testing-library", pattern: /@testing-library\/react/ },
  { reason: "react-dom", pattern: /react-dom\/client|\broot\.render\s*\(/ },
  { reason: "render-hook", pattern: /\brenderHook\s*\(/ },
  {
    reason: "react-render",
    pattern: /\brender\s*\(|\bscreen\.|\bfireEvent\.|\buserEvent\.|\bwithin\s*\(|\bwaitFor\s*\(/,
  },
  {
    reason: "browser-dom",
    pattern:
      /\bwindow\b|\bdocument\b|\bnavigator\b|\blocalStorage\b|\bsessionStorage\b|\bResizeObserver\b|\bIntersectionObserver\b|\bmatchMedia\b/,
  },
];

export function normalizeVitestPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

export function isVitestTestFile(filePath) {
  return TEST_FILE_PATTERN.test(normalizeVitestPath(filePath));
}

function explicitLayerFromPath(filePath) {
  const match = normalizeVitestPath(filePath).match(EXPLICIT_LAYER_PATTERN);
  return match?.[1] ?? null;
}

function includesTsxPath(filePath) {
  return /\.tsx$/i.test(normalizeVitestPath(filePath));
}

function matchReasons(patterns, input) {
  return patterns
    .filter(({ pattern }) => pattern.test(input))
    .map(({ reason }) => reason);
}

export function classifyVitestTestFile({ filePath, source = "" }) {
  const normalizedPath = normalizeVitestPath(filePath);
  const text = `${normalizedPath}\n${source}`;
  const explicitLayer = explicitLayerFromPath(normalizedPath);

  if (LIVE_TEST_PATTERN.test(normalizedPath)) {
    return {
      layer: "e2e",
      explicitLayer,
      live: true,
      reasons: ["name:live"],
    };
  }

  if (explicitLayer && VITEST_LAYER_NAMES.includes(explicitLayer)) {
    return {
      layer: explicitLayer,
      explicitLayer,
      live: false,
      reasons: [`name:${explicitLayer}`],
    };
  }

  const e2eReasons = matchReasons(E2E_PATTERNS, text);
  if (e2eReasons.length > 0) {
    return {
      layer: "e2e",
      explicitLayer,
      live: false,
      reasons: e2eReasons,
    };
  }

  const integrationReasons = matchReasons(INTEGRATION_PATTERNS, text);
  if (integrationReasons.length > 0) {
    return {
      layer: "integration",
      explicitLayer,
      live: false,
      reasons: integrationReasons,
    };
  }

  const contractReasons = matchReasons(CONTRACT_PATTERNS, text);
  if (contractReasons.length > 0) {
    return {
      layer: "contract",
      explicitLayer,
      live: false,
      reasons: contractReasons,
    };
  }

  const networkIntegrationReasons = matchReasons(
    NETWORK_INTEGRATION_PATTERNS,
    text,
  );
  if (networkIntegrationReasons.length > 0) {
    return {
      layer: "integration",
      explicitLayer,
      live: false,
      reasons: networkIntegrationReasons,
    };
  }

  const componentReasons = matchReasons(COMPONENT_PATTERNS, text);
  if (componentReasons.length > 0 || includesTsxPath(normalizedPath)) {
    return {
      layer: "component",
      explicitLayer,
      live: false,
      reasons:
        componentReasons.length > 0 ? componentReasons : ["extension:tsx"],
    };
  }

  return {
    layer: "unit",
    explicitLayer,
    live: false,
    reasons: explicitLayer ? [`name:${explicitLayer}`] : ["default:unit"],
  };
}

function shouldSkipDirectory(dirName) {
  return EXCLUDED_DIR_NAMES.has(dirName);
}

function shouldSkipPath(filePath) {
  const normalized = normalizeVitestPath(path.resolve(filePath));
  return EXCLUDED_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

export function collectVitestTestFiles(repoRoot = process.cwd()) {
  const results = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name) && !shouldSkipPath(entryPath)) {
          visit(entryPath);
        }
        continue;
      }

      if (!entry.isFile() || shouldSkipPath(entryPath)) {
        continue;
      }

      const relativePath = normalizeVitestPath(
        path.relative(repoRoot, entryPath),
      );
      if (isVitestTestFile(relativePath)) {
        results.push(relativePath);
      }
    }
  }

  visit(repoRoot);
  return results.sort((a, b) => a.localeCompare(b));
}

export function readVitestTestSource(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export function classifyVitestTestFiles(repoRoot, files) {
  return files.map((file) => ({
    file,
    ...classifyVitestTestFile({
      filePath: file,
      source: readVitestTestSource(repoRoot, file),
    }),
  }));
}
