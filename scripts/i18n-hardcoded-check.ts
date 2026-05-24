#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export interface HardcodedI18nFinding {
  file: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
}

export interface HardcodedI18nScanResult {
  files: string[];
  findings: HardcodedI18nFinding[];
}

export type HardcodedI18nReportFormat = "text" | "json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const SCAN_ROOT_PREFIXES = [
  "src/components/",
  "src/features/",
  "src/pages/",
];

const SCAN_ROOT_FILES = new Set(["src/App.tsx", "src/main.tsx"]);

const SKIP_PREFIXES = [
  "src/i18n/resources/",
  "src/i18n/legacy-patch/",
  "src/i18n/__tests__/",
];

const SKIP_FILE_PATTERNS = [/\.(test|spec)\.[^.]+$/];

const VISIBLE_PROP_NAMES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "caption",
  "confirmText",
  "description",
  "emptyText",
  "helperText",
  "label",
  "message",
  "okText",
  "placeholder",
  "prompt",
  "subtitle",
  "title",
  "tooltip",
]);

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function resolveFilePath(inputPath: string): string {
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.join(REPO_ROOT, inputPath);
}

function matchesScanPath(file: string, target: string): boolean {
  const normalizedTarget = target.replace(/\/+$/, "");
  return (
    file === normalizedTarget ||
    file.startsWith(`${normalizedTarget}/`) ||
    file.endsWith(`/${normalizedTarget}`) ||
    file.includes(`/${normalizedTarget}/`)
  );
}

function isScanTarget(file: string): boolean {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) {
    return false;
  }

  if (SKIP_PREFIXES.some((prefix) => matchesScanPath(file, prefix))) {
    return false;
  }

  if (SKIP_FILE_PATTERNS.some((pattern) => pattern.test(file))) {
    return false;
  }

  return (
    [...SCAN_ROOT_FILES].some((target) => matchesScanPath(file, target)) ||
    SCAN_ROOT_PREFIXES.some((prefix) => matchesScanPath(file, prefix))
  );
}

function trimSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isVisibleText(value: string): boolean {
  return /[\p{L}\p{N}\u4e00-\u9fff]/u.test(value);
}

function isShortcutToken(value: string): boolean {
  return /^[A-Z0-9]$/.test(value);
}

function isSuspiciousLiteral(propName: string, value: string): boolean {
  if (!VISIBLE_PROP_NAMES.has(propName)) {
    return false;
  }

  const normalized = trimSnippet(value);
  return normalized.length > 0;
}

function resolveScriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (file.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function getLocation(sourceFile: ts.SourceFile, node: ts.Node): {
  column: number;
  line: number;
} {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return {
    line: line + 1,
    column: character + 1,
  };
}

function createFinding(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  message: string,
): HardcodedI18nFinding {
  const { line, column } = getLocation(sourceFile, node);
  return {
    file,
    line,
    column,
    message,
    snippet: trimSnippet(node.getText(sourceFile)),
  };
}

function unwrapLiteralExpression(
  expression: ts.Expression,
): ts.Expression | undefined {
  let current: ts.Expression = expression;

  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }

  if (
    ts.isStringLiteral(current) ||
    ts.isNoSubstitutionTemplateLiteral(current)
  ) {
    return current;
  }

  return undefined;
}

function scanJsxNode(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  findings: HardcodedI18nFinding[],
): void {
  if (ts.isJsxText(node)) {
    const text = trimSnippet(node.getText(sourceFile));
    if (text.length > 0 && isVisibleText(text) && !isShortcutToken(text)) {
      findings.push(
        createFinding(
          file,
          sourceFile,
          node,
          "JSX text node contains hard-coded user-visible text.",
        ),
      );
    }
    return;
  }

  if (
    ts.isJsxExpression(node) &&
    (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
  ) {
    const literal = unwrapLiteralExpression(node.expression);
    if (literal) {
      const text = trimSnippet(literal.text);
      if (text.length > 0 && isVisibleText(text) && !isShortcutToken(text)) {
        findings.push(
          createFinding(
            file,
            sourceFile,
            node,
            "JSX expression contains a hard-coded user-visible literal.",
          ),
        );
      }
    }
    return;
  }

  if (!ts.isJsxAttribute(node)) {
    return;
  }

  const propName = node.name.getText(sourceFile);
  const initializer = node.initializer;
  if (!initializer) {
    return;
  }

  if (
    ts.isStringLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    const text = trimSnippet(initializer.text);
    if (isSuspiciousLiteral(propName, text) && isVisibleText(text)) {
      findings.push(
        createFinding(
          file,
          sourceFile,
          node,
          `Visible prop ${propName} uses a hard-coded literal.`,
        ),
      );
    }
    return;
  }

  if (ts.isJsxExpression(initializer)) {
    const literal = unwrapLiteralExpression(initializer.expression);
    if (!literal) {
      return;
    }

    const text = trimSnippet(literal.text);
    if (isSuspiciousLiteral(propName, text) && isVisibleText(text)) {
      findings.push(
        createFinding(
          file,
          sourceFile,
          node,
          `Visible prop ${propName} uses a hard-coded literal.`,
        ),
      );
    }
  }
}

function visitJsxTree(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  findings: HardcodedI18nFinding[],
): void {
  scanJsxNode(file, sourceFile, node, findings);
  ts.forEachChild(node, (child) => visitJsxTree(file, sourceFile, child, findings));
}

export function scanHardcodedI18n(files: string[]): HardcodedI18nScanResult {
  const normalizedFiles = files
    .map((file) => normalizePath(file))
    .filter((file) => isScanTarget(file));
  const findings: HardcodedI18nFinding[] = [];

  for (const file of normalizedFiles) {
    const absolutePath = resolveFilePath(file);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      continue;
    }

    const source = fs.readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      resolveScriptKind(file),
    );
    visitJsxTree(file, sourceFile, sourceFile, findings);
  }

  return {
    files: normalizedFiles,
    findings,
  };
}

export function formatHardcodedI18nReport(
  result: HardcodedI18nScanResult,
  format: HardcodedI18nReportFormat = "text",
): string {
  if (format === "json") {
    return `${JSON.stringify(
      {
        files: result.files,
        findings: result.findings,
        summary: {
          findingCount: result.findings.length,
          scannedFileCount: result.files.length,
        },
      },
      null,
      2,
    )}\n`;
  }

  if (result.files.length === 0) {
    return "[i18n:scan] 未找到可扫描的前端源码文件。\n";
  }

  const lines = [
    `[i18n:scan] scanned=${result.files.length} findings=${result.findings.length}`,
  ];

  for (const finding of result.findings) {
    lines.push(
      `${finding.file}:${finding.line}:${finding.column} ${finding.message}`,
      `  ${finding.snippet}`,
    );
  }

  if (result.findings.length === 0) {
    lines.push("[i18n:scan] 通过：未发现当前变更文件中的硬编码用户可见文案。");
  }

  return `${lines.join("\n")}\n`;
}

function main(): void {
  const args = process.argv.slice(2);
  const files = parseFiles(args);
  const format = parseFormat(args);
  const result = scanHardcodedI18n(files);
  process.stdout.write(formatHardcodedI18nReport(result, format));

  if (result.findings.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}

function parseFiles(argv: string[]): string[] {
  const files: string[] = [];
  let captureFiles = false;
  let skipNext = false;

  for (const arg of argv) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (captureFiles) {
      files.push(arg);
      continue;
    }

    if (arg === "--files") {
      captureFiles = true;
      continue;
    }

    if (arg === "--format") {
      skipNext = true;
      continue;
    }

    if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }

  return files;
}

function parseFormat(argv: string[]): HardcodedI18nReportFormat {
  const formatIndex = argv.findIndex((arg) => arg === "--format");
  if (formatIndex >= 0) {
    const candidate = argv[formatIndex + 1];
    if (candidate === "json") {
      return "json";
    }
  }

  if (argv.includes("json")) {
    return "json";
  }

  return "text";
}
