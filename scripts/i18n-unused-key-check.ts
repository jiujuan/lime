#!/usr/bin/env tsx

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

import { flattenResource } from "./detect-missing-translations";

export interface UnusedI18nKey {
  key: string;
  namespace: string;
}

export interface I18nDynamicKeyPattern {
  pattern: string;
  source: string;
}

export interface I18nUnusedNamespaceSummary {
  namespace: string;
  protectedKeyCount: number;
  referencedKeyCount: number;
  resourceKeyCount: number;
  unusedKeyCount: number;
  unusedRatio: number;
}

export interface I18nUnusedKeyFamilySummary {
  prefix: string;
  count: number;
}

export interface I18nUnusedKeyScanOptions {
  includeTests?: boolean;
  protectedPrefixes?: string[];
  resourcesDir: string;
  sourceDirs: string[];
  sourceLocale?: string;
}

export interface I18nUnusedKeyScanResult {
  protectedKeys: UnusedI18nKey[];
  referencedKeys: string[];
  resourceKeys: UnusedI18nKey[];
  resourcesDir: string;
  scannedFiles: string[];
  sourceDirs: string[];
  sourceLocale: string;
  dynamicKeyPatterns: I18nDynamicKeyPattern[];
  namespaceSummaries: I18nUnusedNamespaceSummary[];
  unusedKeys: UnusedI18nKey[];
}

export type I18nUnusedKeyReportFormat = "text" | "json";

interface CliOptions extends I18nUnusedKeyScanOptions {
  check: boolean;
  format: I18nUnusedKeyReportFormat;
}

const DEFAULT_SOURCE_LOCALE = "zh-CN";
const DEFAULT_PROTECTED_PREFIXES = [
  "agentChat.agentUiProjection.control.",
  "agentChat.agentUiProjection.eventType.",
  "agentChat.agentUiProjection.lane.",
  "agentChat.agentUiProjection.phase.",
  "agentChat.agentUiProjection.requestedFixStatus.",
  "agentChat.agentUiProjection.sourceType.",
  "agentChat.agentUiProjection.surface.",
  "agentChat.teamWorkspace.control.",
  "agentChat.threadReliability.memoryBaseline.",
  "agentChat.threadReliability.memoryPrefetchPreview.",
  "agentChat.threadReliability.panel.",
  "agentChat.inputIntent.imageGeneration.",
  "curatedTask.templates.account-project-review.",
  "curatedTask.templates.daily-trend-briefing.",
  "curatedTask.templates.longform-multiplatform-rewrite.",
  "curatedTask.templates.script-to-voiceover.",
  "curatedTask.templates.social-post-starter.",
  "curatedTask.templates.viral-content-breakdown.",
  "skills.workspace.featured.",
  "skills.workspace.managedJob.",
  "skills.workspace.marketplace.",
  "skills.workspace.sidebar.",
  "workspace.document.editor.slashCommand.",
] as const;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RESOURCES_DIR = path.join(REPO_ROOT, "src", "i18n", "resources");
const DEFAULT_SOURCE_DIRS = [path.join(REPO_ROOT, "src")];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_SOURCE_SEGMENTS = [
  "/src/i18n/resources/",
  "/src/i18n/legacy-patch/",
  "/node_modules/",
];
const TEST_FILE_PATTERN = /\.(test|spec)\.[^.]+$/;

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function displayPath(filePath: string): string {
  const relative = path.relative(REPO_ROOT, filePath);
  return normalizePath(relative && !relative.startsWith("..") ? relative : filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`i18n resource must be a JSON object: ${filePath}`);
  }
  return parsed;
}

function listResourceKeys(
  resourcesDir: string,
  sourceLocale: string,
): UnusedI18nKey[] {
  const localeDir = path.join(resourcesDir, sourceLocale);
  if (!fs.existsSync(localeDir)) {
    throw new Error(`Source locale resources directory does not exist: ${localeDir}`);
  }

  return fs
    .readdirSync(localeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .flatMap((entry) => {
      const namespace = path.basename(entry.name, ".json");
      const resource = readJsonObject(path.join(localeDir, entry.name));
      return Object.keys(flattenResource(resource)).map((key) => ({
        key,
        namespace,
      }));
    })
    .sort((left, right) =>
      `${left.namespace}:${left.key}`.localeCompare(`${right.namespace}:${right.key}`),
    );
}

function isSourceFile(filePath: string, includeTests: boolean): boolean {
  const normalized = normalizePath(filePath);
  if (!SOURCE_EXTENSIONS.has(path.extname(filePath))) {
    return false;
  }

  if (SKIP_SOURCE_SEGMENTS.some((segment) => normalized.includes(segment))) {
    return false;
  }

  if (!includeTests && TEST_FILE_PATTERN.test(path.basename(filePath))) {
    return false;
  }

  if (!includeTests && normalized.includes("/__tests__/")) {
    return false;
  }

  return true;
}

function collectSourceFiles(sourceDirs: string[], includeTests: boolean): string[] {
  const files: string[] = [];
  const visit = (target: string) => {
    if (!fs.existsSync(target)) {
      return;
    }

    const stat = fs.statSync(target);
    if (stat.isFile()) {
      if (isSourceFile(target, includeTests)) {
        files.push(path.resolve(target));
      }
      return;
    }

    if (!stat.isDirectory()) {
      return;
    }

    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      visit(path.join(target, entry.name));
    }
  };

  for (const sourceDir of sourceDirs) {
    visit(path.resolve(sourceDir));
  }

  return Array.from(new Set(files)).sort((left, right) =>
    displayPath(left).localeCompare(displayPath(right)),
  );
}

function scriptKindForFile(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (filePath.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isI18nTranslateCall(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === "t";
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "t";
  }

  return false;
}

function resolveStaticStringExpression(
  expression: ts.Expression,
  constStrings: Map<string, string>,
  constInitializers: Map<string, ts.Expression>,
): string | null {
  let current: ts.Expression = expression;

  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }

  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current.text;
  }

  if (ts.isIdentifier(current)) {
    if (constStrings.has(current.text)) {
      return constStrings.get(current.text) ?? null;
    }
    const initializer = constInitializers.get(current.text);
    return initializer
      ? resolveStaticStringExpression(initializer, constStrings, constInitializers)
      : null;
  }

  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = resolveStaticStringExpression(
      current.left,
      constStrings,
      constInitializers,
    );
    const right = resolveStaticStringExpression(
      current.right,
      constStrings,
      constInitializers,
    );
    return left !== null && right !== null ? `${left}${right}` : null;
  }

  return null;
}

function collectConstStringValues(sourceFile: ts.SourceFile): Map<string, string> {
  const constStrings = new Map<string, string>();
  const constInitializers = collectConstInitializers(sourceFile);

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const declarationList = node.parent;
      if (
        ts.isVariableDeclarationList(declarationList) &&
        (declarationList.flags & ts.NodeFlags.Const) !== 0
      ) {
        const value = resolveStaticStringExpression(
          node.initializer,
          constStrings,
          constInitializers,
        );
        if (value !== null) {
          constStrings.set(node.name.text, value);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return constStrings;
}

function collectConstInitializers(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const constInitializers = new Map<string, ts.Expression>();

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const declarationList = node.parent;
      if (
        ts.isVariableDeclarationList(declarationList) &&
        (declarationList.flags & ts.NodeFlags.Const) !== 0
      ) {
        constInitializers.set(node.name.text, node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return constInitializers;
}

function createDynamicKeyPattern(
  filePath: string,
  sourceFile: ts.SourceFile,
  constStrings: Map<string, string>,
  constInitializers: Map<string, ts.Expression>,
  expression: ts.Expression,
): I18nDynamicKeyPattern | null {
  function render(
    expr: ts.Expression,
  ): { pattern: string; prefix: string; hasWildcard: boolean } {
    let current: ts.Expression = expr;

    while (ts.isParenthesizedExpression(current)) {
      current = current.expression;
    }

    if (
      ts.isStringLiteral(current) ||
      ts.isNoSubstitutionTemplateLiteral(current)
    ) {
      return {
        pattern: escapeRegExp(current.text),
        prefix: current.text,
        hasWildcard: false,
      };
    }

    if (ts.isIdentifier(current)) {
      const staticValue = resolveStaticStringExpression(
        current,
        constStrings,
        constInitializers,
      );
      if (staticValue !== null) {
        return {
          pattern: escapeRegExp(staticValue),
          prefix: staticValue,
          hasWildcard: false,
        };
      }

      const initializer = constInitializers.get(current.text);
      if (initializer) {
        return render(initializer);
      }

      return {
        pattern: "(.+?)",
        prefix: "",
        hasWildcard: true,
      };
    }

    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = render(current.left);
      const right = render(current.right);
      return {
        pattern: `${left.pattern}${right.pattern}`,
        prefix: left.hasWildcard ? left.prefix : `${left.prefix}${right.prefix}`,
        hasWildcard: left.hasWildcard || right.hasWildcard,
      };
    }

    if (ts.isTemplateExpression(current)) {
      let pattern = escapeRegExp(current.head.text);
      let prefix = current.head.text;
      let hasWildcard = false;
      for (const span of current.templateSpans) {
        const rendered = render(span.expression);
        pattern += rendered.pattern;
        if (!hasWildcard) {
          prefix += rendered.prefix;
          if (rendered.hasWildcard) {
            hasWildcard = true;
          } else {
            prefix += span.literal.text;
          }
        }
        pattern += escapeRegExp(span.literal.text);
        if (rendered.hasWildcard) {
          hasWildcard = true;
        }
      }
      return { pattern, prefix, hasWildcard };
    }

    return {
      pattern: "(.+?)",
      prefix: "",
      hasWildcard: true,
    };
  }

  const rendered = render(expression);
  if (!rendered.hasWildcard && !rendered.prefix.includes(".")) {
    return null;
  }
  if (!rendered.prefix || !/^[A-Za-z][\w-]*(?:\.[A-Za-z0-9][\w-]*)+\.$/.test(rendered.prefix)) {
    return null;
  }

  const pattern = `^${rendered.pattern}$`;
  const position = sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile));
  return {
    pattern,
    source: `${displayPath(filePath)}:${position.line + 1}`,
  };
}

function collectKeyReferences(filePath: string): {
  dynamicPatterns: I18nDynamicKeyPattern[];
  literals: string[];
} {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );
  const constInitializers = collectConstInitializers(sourceFile);
  const constStrings = collectConstStringValues(sourceFile);
  const literals = new Set<string>();
  const dynamicPatterns = new Map<string, I18nDynamicKeyPattern>();

  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      literals.add(node.text);
    }
    if (ts.isCallExpression(node) && isI18nTranslateCall(node)) {
      const firstArg = node.arguments[0];
      if (firstArg) {
        const pattern = createDynamicKeyPattern(
          filePath,
          sourceFile,
          constStrings,
          constInitializers,
          firstArg,
        );
        if (pattern) {
          dynamicPatterns.set(pattern.pattern, pattern);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    dynamicPatterns: [...dynamicPatterns.values()],
    literals: [...literals],
  };
}

function isProtectedKey(key: string, protectedPrefixes: string[]): boolean {
  return protectedPrefixes.some((prefix) => key === prefix || key.startsWith(prefix));
}

function buildNamespaceSummaries(
  resourceKeys: UnusedI18nKey[],
  referencedKeySet: Set<string>,
  protectedKeys: UnusedI18nKey[],
  unusedKeys: UnusedI18nKey[],
): I18nUnusedNamespaceSummary[] {
  const resourceCounts = new Map<string, number>();
  const referencedCounts = new Map<string, number>();
  const protectedCounts = new Map<string, number>();
  const unusedCounts = new Map<string, number>();

  for (const item of resourceKeys) {
    resourceCounts.set(item.namespace, (resourceCounts.get(item.namespace) ?? 0) + 1);
    if (referencedKeySet.has(item.key)) {
      referencedCounts.set(
        item.namespace,
        (referencedCounts.get(item.namespace) ?? 0) + 1,
      );
    }
  }

  for (const item of protectedKeys) {
    protectedCounts.set(item.namespace, (protectedCounts.get(item.namespace) ?? 0) + 1);
  }

  for (const item of unusedKeys) {
    unusedCounts.set(item.namespace, (unusedCounts.get(item.namespace) ?? 0) + 1);
  }

  return [...resourceCounts.keys()]
    .map((namespace) => {
      const resourceKeyCount = resourceCounts.get(namespace) ?? 0;
      const referencedKeyCount = referencedCounts.get(namespace) ?? 0;
      const protectedKeyCount = protectedCounts.get(namespace) ?? 0;
      const unusedKeyCount = unusedCounts.get(namespace) ?? 0;

      return {
        namespace,
        protectedKeyCount,
        referencedKeyCount,
        resourceKeyCount,
        unusedKeyCount,
        unusedRatio:
          resourceKeyCount > 0 ? unusedKeyCount / resourceKeyCount : 0,
      };
    })
    .sort((left, right) => {
      if (right.unusedKeyCount !== left.unusedKeyCount) {
        return right.unusedKeyCount - left.unusedKeyCount;
      }
      if (right.resourceKeyCount !== left.resourceKeyCount) {
        return right.resourceKeyCount - left.resourceKeyCount;
      }
      return left.namespace.localeCompare(right.namespace);
    });
}

export function scanUnusedI18nKeys(
  options: I18nUnusedKeyScanOptions,
): I18nUnusedKeyScanResult {
  const resourcesDir = path.resolve(options.resourcesDir);
  const sourceLocale = options.sourceLocale || DEFAULT_SOURCE_LOCALE;
  const protectedPrefixes = [
    ...DEFAULT_PROTECTED_PREFIXES,
    ...(options.protectedPrefixes ?? []),
  ];
  const sourceDirs = options.sourceDirs.map((sourceDir) => path.resolve(sourceDir));
  const resourceKeys = listResourceKeys(resourcesDir, sourceLocale);
  const scannedFilePaths = collectSourceFiles(
    sourceDirs,
    Boolean(options.includeTests),
  );
  const referencedLiteralSet = new Set<string>();
  const dynamicKeyPatterns = new Map<string, I18nDynamicKeyPattern>();

  for (const filePath of scannedFilePaths) {
    const references = collectKeyReferences(filePath);
    for (const literal of references.literals) {
      referencedLiteralSet.add(literal);
    }
    for (const pattern of references.dynamicPatterns) {
      dynamicKeyPatterns.set(pattern.pattern, pattern);
    }
  }
  const dynamicKeyRegexps = [...dynamicKeyPatterns.values()].map((item) => ({
    ...item,
    regexp: new RegExp(item.pattern),
  }));
  const isDynamicallyReferenced = (key: string) =>
    dynamicKeyRegexps.some((item) => item.regexp.test(key));

  const protectedKeys = resourceKeys.filter(
    (item) =>
      !referencedLiteralSet.has(item.key) &&
      (isProtectedKey(item.key, protectedPrefixes) ||
        isDynamicallyReferenced(item.key)),
  );
  const unusedKeys = resourceKeys.filter(
    (item) =>
      !referencedLiteralSet.has(item.key) &&
      !isProtectedKey(item.key, protectedPrefixes) &&
      !isDynamicallyReferenced(item.key),
  );
  const referencedKeys = resourceKeys
    .map((item) => item.key)
    .filter((key) => referencedLiteralSet.has(key))
    .sort((left, right) => left.localeCompare(right));
  const namespaceSummaries = buildNamespaceSummaries(
    resourceKeys,
    referencedLiteralSet,
    protectedKeys,
    unusedKeys,
  );

  return {
    protectedKeys,
    referencedKeys,
    resourceKeys,
    resourcesDir,
    scannedFiles: scannedFilePaths.map(displayPath),
    sourceDirs: sourceDirs.map(displayPath),
    sourceLocale,
    dynamicKeyPatterns: [...dynamicKeyPatterns.values()].sort((left, right) =>
      left.pattern.localeCompare(right.pattern),
    ),
    namespaceSummaries,
    unusedKeys,
  };
}

function groupByNamespace(keys: UnusedI18nKey[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const item of keys) {
    grouped[item.namespace] ??= [];
    grouped[item.namespace].push(item.key);
  }

  return Object.fromEntries(
    Object.entries(grouped)
      .map(([namespace, values]) => [
        namespace,
        values.sort((left, right) => left.localeCompare(right)),
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function groupByKeyPrefix(
  keys: string[],
  prefixSegments: number,
): I18nUnusedKeyFamilySummary[] {
  const families = new Map<string, number>();
  for (const key of keys) {
    const prefix = key.split(".").slice(0, prefixSegments).join(".");
    families.set(prefix, (families.get(prefix) ?? 0) + 1);
  }

  return [...families.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.prefix.localeCompare(right.prefix);
    });
}

function buildUnusedKeyFamilySummaries(
  unusedKeysByNamespace: Record<string, string[]>,
): Record<string, I18nUnusedKeyFamilySummary[]> {
  return Object.fromEntries(
    Object.entries(unusedKeysByNamespace).map(([namespace, keys]) => [
      namespace,
      groupByKeyPrefix(keys, 3).slice(0, 10),
    ]),
  );
}

function createUnusedKeyReport(result: I18nUnusedKeyScanResult) {
  const unusedKeysByNamespace = groupByNamespace(result.unusedKeys);
  return {
    schemaVersion: "lime.i18n.unusedKeyReport.v1",
    resourcesDir: displayPath(result.resourcesDir),
    sourceLocale: result.sourceLocale,
    sourceDirs: result.sourceDirs,
    summary: {
      protectedKeyCount: result.protectedKeys.length,
      dynamicKeyPatternCount: result.dynamicKeyPatterns.length,
      referencedKeyCount: result.referencedKeys.length,
      resourceKeyCount: result.resourceKeys.length,
      scannedFileCount: result.scannedFiles.length,
      unusedKeyCount: result.unusedKeys.length,
    },
    dynamicKeyPatterns: result.dynamicKeyPatterns,
    namespaceSummaries: result.namespaceSummaries,
    unusedKeyFamiliesByNamespace: buildUnusedKeyFamilySummaries(
      unusedKeysByNamespace,
    ),
    unusedKeysByNamespace,
    protectedKeysByNamespace: groupByNamespace(result.protectedKeys),
  };
}

export function formatUnusedI18nKeyReport(
  result: I18nUnusedKeyScanResult,
  format: I18nUnusedKeyReportFormat = "text",
): string {
  const report = createUnusedKeyReport(result);
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}${os.EOL}`;
  }

  const lines = [
    `[i18n:unused] resources=${report.resourcesDir} source=${report.sourceLocale} scanned=${result.scannedFiles.length} resources=${result.resourceKeys.length} referenced=${result.referencedKeys.length} unused=${result.unusedKeys.length} protected=${result.protectedKeys.length} dynamicPatterns=${result.dynamicKeyPatterns.length}`,
  ];

  if (result.unusedKeys.length === 0) {
    lines.push("[i18n:unused] 通过：未发现未引用的 source locale key。");
  } else {
    lines.push("[i18n:unused] 未引用 key 候选：");
    for (const [namespace, keys] of Object.entries(report.unusedKeysByNamespace)) {
      lines.push(`  ${namespace}: ${keys.length}`);
      for (const key of keys.slice(0, 20)) {
        lines.push(`    - ${key}`);
      }
      if (keys.length > 20) {
        lines.push(`    ... 其余 ${keys.length - 20} 个省略`);
      }
    }
  }

  if (Object.keys(report.unusedKeyFamiliesByNamespace).length > 0) {
    lines.push("[i18n:unused] 未引用 key 家族热点：");
    for (const item of result.namespaceSummaries.slice(0, 10)) {
      const families = report.unusedKeyFamiliesByNamespace[item.namespace] ?? [];
      if (families.length === 0) {
        continue;
      }
      lines.push(`  ${item.namespace}:`);
      for (const family of families.slice(0, 5)) {
        lines.push(`    - ${family.prefix}: ${family.count}`);
      }
    }
  }

  lines.push("[i18n:unused] namespace 热点：");
  for (const item of report.namespaceSummaries.slice(0, 10)) {
    lines.push(
      `  - ${item.namespace}: total=${item.resourceKeyCount} referenced=${item.referencedKeyCount} protected=${item.protectedKeyCount} unused=${item.unusedKeyCount} unusedRatio=${(
        item.unusedRatio * 100
      ).toFixed(1)}%`,
    );
  }
  if (report.namespaceSummaries.length > 10) {
    lines.push(
      `  ... 其余 ${report.namespaceSummaries.length - 10} 个 namespace 省略`,
    );
  }

  if (result.protectedKeys.length > 0) {
    lines.push("[i18n:unused] protected dynamic key 候选：");
    for (const [namespace, keys] of Object.entries(report.protectedKeysByNamespace)) {
      lines.push(`  ${namespace}: ${keys.length}`);
    }
  }

  if (result.dynamicKeyPatterns.length > 0) {
    lines.push("[i18n:unused] inferred dynamic key patterns:");
    for (const pattern of result.dynamicKeyPatterns.slice(0, 20)) {
      lines.push(`  - ${pattern.pattern} (${pattern.source})`);
    }
    if (result.dynamicKeyPatterns.length > 20) {
      lines.push(`  ... 其余 ${result.dynamicKeyPatterns.length - 20} 个省略`);
    }
  }

  return `${lines.join(os.EOL)}${os.EOL}`;
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    check: false,
    format: "text",
    includeTests: false,
    protectedPrefixes: [],
    resourcesDir: DEFAULT_RESOURCES_DIR,
    sourceDirs: [],
    sourceLocale: DEFAULT_SOURCE_LOCALE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--include-tests") {
      options.includeTests = true;
      continue;
    }
    if (arg === "--format") {
      if (next === "json" || next === "text") {
        options.format = next;
        index += 1;
        continue;
      }
      throw new Error(`Unknown or missing format value: ${next ?? "(missing)"}`);
    }
    if (arg === "--protected-prefix" && next) {
      options.protectedPrefixes?.push(next);
      index += 1;
      continue;
    }
    if (arg === "--resources-dir" && next) {
      options.resourcesDir = next;
      index += 1;
      continue;
    }
    if (arg === "--source-dir" && next) {
      options.sourceDirs.push(next);
      index += 1;
      continue;
    }
    if (arg === "--source-locale" && next) {
      options.sourceLocale = next;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: npm run i18n:unused -- [--check] [--format text|json] [--resources-dir <dir>] [--source-dir <dir>] [--source-locale <locale>] [--protected-prefix <prefix>] [--include-tests]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.sourceDirs.length === 0) {
    options.sourceDirs = DEFAULT_SOURCE_DIRS;
  }

  return options;
}

export function runCli(argv = process.argv.slice(2)): number {
  const options = parseCliArgs(argv);
  const result = scanUnusedI18nKeys(options);
  process.stdout.write(formatUnusedI18nKeyReport(result, options.format));
  return options.check && result.unusedKeys.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(
      `[i18n:unused] 失败：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
