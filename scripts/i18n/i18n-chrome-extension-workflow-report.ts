#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type ChromeExtensionWorkflowReportFormat = "text" | "json";

export interface ChromeExtensionWorkflowPageReport {
  dataI18nAttributeCount: number;
  dataI18nLikeAttributeCount: number;
  installI18nRegisteredLocales: string[];
  path: string;
}

export interface ChromeExtensionWorkflowTerminologyReport {
  files: string[];
  occurrenceCount: number;
  present: boolean;
  term: string;
}

export interface ChromeExtensionWorkflowReport {
  chromeLocales: {
    localeDirs: string[];
    localesDirExists: boolean;
  };
  decision: {
    standardChromeLocaleWorkflowRequired: boolean;
    status: "deferred" | "ready" | "required";
    summary: string;
  };
  extensionRoot: string;
  installI18n: {
    registeredButUnsupportedLocales: string[];
    registeredLocales: string[];
    scriptExists: boolean;
    supportedButUnregisteredLocales: string[];
    supportedLocales: string[];
  };
  manifest: {
    actionDefaultTitle: string | null;
    defaultLocale: string | null;
    description: string | null;
    hasDefaultLocale: boolean;
    hasMessageReferences: boolean;
    name: string | null;
    version: string | null;
  };
  optionsPage: {
    scriptExists: boolean;
    supportedButMissingTranslations: string[];
    supportedLanguages: string[];
    translationButUnsupportedLanguages: string[];
    translationLocales: string[];
  };
  pages: ChromeExtensionWorkflowPageReport[];
  repoRoot: string;
  schemaVersion: string;
  summary: {
    dataI18nAttributeCount: number;
    htmlPageCount: number;
    installI18nLocaleDriftCount: number;
    installI18nSupportedLocaleCount: number;
    manifestHasDefaultLocale: boolean;
    optionsLanguageDriftCount: number;
    optionsSupportedLanguageCount: number;
    pageRegistryLocaleCount: number;
    standardChromeLocaleDecisionRecorded: boolean;
    standardChromeLocaleWorkflowRequired: boolean;
    standardChromeLocaleWorkflowPresent: boolean;
    terminologyPresentCount: number;
  };
  terminology: ChromeExtensionWorkflowTerminologyReport[];
}

interface CliOptions {
  extensionRoot?: string;
  format: ChromeExtensionWorkflowReportFormat;
  output?: string;
  repoRoot: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const TERMINOLOGY_TERMS = [
  "Lime Browser Bridge",
  "Lime Browser Connector",
  "Lime Agent",
  "Browser Connection",
  "Relay",
] as const;

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function displayPath(filePath: string, repoRoot: string): string {
  const relative = path.relative(repoRoot, filePath);
  return normalizePath(
    relative && !relative.startsWith("..") ? relative : filePath,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function dirExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function readText(filePath: string): string {
  return fileExists(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return parsed;
}

function collectFiles(root: string): string[] {
  if (!dirExists(root)) {
    return [];
  }

  const result: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        result.push(entryPath);
      }
    }
  }

  return result.sort((left, right) => left.localeCompare(right));
}

function collectLocaleDirs(localesDir: string): string[] {
  if (!dirExists(localesDir)) {
    return [];
  }

  return fs
    .readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueSorted(left.filter((value) => !rightSet.has(value)));
}

function parseStringArrayLiteral(
  content: string,
  variableName: string,
): string[] {
  const pattern = new RegExp(
    String.raw`\b(?:const|let|var)\s+${variableName}\s*=\s*\[([\s\S]*?)\]`,
    "m",
  );
  const match = content.match(pattern);
  if (!match?.[1]) {
    return [];
  }

  const values: string[] = [];
  const valuePattern = /["']([^"']+)["']/g;
  for (const valueMatch of match[1].matchAll(valuePattern)) {
    if (valueMatch[1]) {
      values.push(valueMatch[1]);
    }
  }
  return uniqueSorted(values);
}

function findObjectLiteralBody(
  content: string,
  variableName: string,
): string | null {
  const pattern = new RegExp(
    String.raw`\b(?:const|let|var)\s+${variableName}\s*=\s*\{`,
    "m",
  );
  const match = content.match(pattern);
  if (!match?.index) {
    return null;
  }

  const start = match.index + match[0].length;
  let depth = 1;
  let quote: string | null = null;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (!char) {
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index);
      }
    }
  }

  return null;
}

function parseTopLevelObjectKeys(
  content: string,
  variableName: string,
): string[] {
  const body = findObjectLiteralBody(content, variableName);
  if (!body) {
    return [];
  }

  const keys: string[] = [];
  let segmentStart = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  const pushSegmentKey = (segment: string) => {
    const match = segment.match(
      /^\s*(?:(["'])([^"']+)\1|([A-Za-z_$][\w$-]*))\s*:/,
    );
    const key = match?.[2] ?? match?.[3];
    if (key) {
      keys.push(key);
    }
  };

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (!char) {
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "," && depth === 0) {
      pushSegmentKey(body.slice(segmentStart, index));
      segmentStart = index + 1;
    }
  }

  pushSegmentKey(body.slice(segmentStart));
  return uniqueSorted(keys);
}

function parseInstallI18nRegistrations(content: string): string[] {
  const locales: string[] = [];
  const pattern = /\bInstallI18n\.register\(\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(pattern)) {
    if (match[1]) {
      locales.push(match[1]);
    }
  }
  return uniqueSorted(locales);
}

function countMatches(content: string, pattern: RegExp): number {
  return Array.from(content.matchAll(pattern)).length;
}

function readManifest(
  manifestPath: string,
): ChromeExtensionWorkflowReport["manifest"] {
  if (!fileExists(manifestPath)) {
    return {
      actionDefaultTitle: null,
      defaultLocale: null,
      description: null,
      hasDefaultLocale: false,
      hasMessageReferences: false,
      name: null,
      version: null,
    };
  }

  const manifest = readJsonObject(manifestPath);
  const action = isRecord(manifest.action) ? manifest.action : null;
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const defaultLocale =
    typeof manifest.default_locale === "string"
      ? manifest.default_locale
      : null;

  return {
    actionDefaultTitle:
      typeof action?.default_title === "string" ? action.default_title : null,
    defaultLocale,
    description:
      typeof manifest.description === "string" ? manifest.description : null,
    hasDefaultLocale: Boolean(defaultLocale),
    hasMessageReferences: /__MSG_[A-Za-z0-9_]+__/.test(manifestText),
    name: typeof manifest.name === "string" ? manifest.name : null,
    version: typeof manifest.version === "string" ? manifest.version : null,
  };
}

function buildPageReports(
  repoRoot: string,
  htmlFiles: string[],
): ChromeExtensionWorkflowPageReport[] {
  return htmlFiles.map((filePath) => {
    const content = readText(filePath);
    return {
      dataI18nAttributeCount: countMatches(content, /\bdata-i18n\s*=/g),
      dataI18nLikeAttributeCount: countMatches(
        content,
        /\bdata-i18n(?:-[a-z]+)?\s*=/g,
      ),
      installI18nRegisteredLocales: parseInstallI18nRegistrations(content),
      path: displayPath(filePath, repoRoot),
    };
  });
}

function isTerminologyTextFile(filePath: string): boolean {
  return /\.(html|js|json|md)$/i.test(filePath);
}

function isRegistryTextFile(filePath: string): boolean {
  return /\.(html|js)$/i.test(filePath);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTerminologyReport(
  repoRoot: string,
  files: string[],
): ChromeExtensionWorkflowTerminologyReport[] {
  const textFiles = files.filter(isTerminologyTextFile);

  return TERMINOLOGY_TERMS.map((term) => {
    const pattern = new RegExp(escapeRegex(term), "g");
    const filesWithTerm: string[] = [];
    let occurrenceCount = 0;

    for (const filePath of textFiles) {
      const count = countMatches(readText(filePath), pattern);
      if (count > 0) {
        occurrenceCount += count;
        filesWithTerm.push(displayPath(filePath, repoRoot));
      }
    }

    return {
      files: filesWithTerm.slice(0, 20),
      occurrenceCount,
      present: occurrenceCount > 0,
      term,
    };
  });
}

export function analyzeChromeExtensionWorkflowReport(
  options: Pick<CliOptions, "extensionRoot" | "repoRoot">,
): ChromeExtensionWorkflowReport {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const extensionRoot = path.resolve(
    options.extensionRoot || path.join(repoRoot, "extensions", "lime-chrome"),
  );
  const manifest = readManifest(path.join(extensionRoot, "manifest.json"));
  const localesDir = path.join(extensionRoot, "_locales");
  const installI18nPath = path.join(
    extensionRoot,
    "pages",
    "scripts",
    "install-i18n.js",
  );
  const optionsScriptPath = path.join(
    extensionRoot,
    "pages",
    "scripts",
    "options.js",
  );
  const allFiles = collectFiles(extensionRoot);
  const htmlFiles = allFiles.filter((filePath) => /\.html$/i.test(filePath));
  const registryFiles = allFiles.filter(isRegistryTextFile);
  const pages = buildPageReports(repoRoot, htmlFiles);
  const installI18nContent = readText(installI18nPath);
  const optionsScriptContent = readText(optionsScriptPath);
  const installI18nSupportedLocales = parseStringArrayLiteral(
    installI18nContent,
    "SUPPORTED",
  );
  const installI18nRegisteredLocales = uniqueSorted(
    registryFiles.flatMap((filePath) =>
      parseInstallI18nRegistrations(readText(filePath)),
    ),
  );
  const optionsSupportedLanguages = parseStringArrayLiteral(
    optionsScriptContent,
    "SUPPORTED_LANGUAGES",
  );
  const optionsTranslationLocales = parseTopLevelObjectKeys(
    optionsScriptContent,
    "OPTIONS_TRANSLATIONS",
  );
  const terminology = buildTerminologyReport(repoRoot, allFiles);
  const dataI18nAttributeCount = pages.reduce(
    (total, page) => total + page.dataI18nAttributeCount,
    0,
  );
  const pageRegistryLocales = uniqueSorted(
    pages.flatMap((page) => page.installI18nRegisteredLocales),
  );
  const localeDirs = collectLocaleDirs(localesDir);

  return {
    chromeLocales: {
      localeDirs,
      localesDirExists: dirExists(localesDir),
    },
    decision: {
      standardChromeLocaleWorkflowRequired: false,
      status: "deferred",
      summary:
        "当前扩展保留轻量 InstallI18n registry；仅当扩展规模、共享翻译产物或发布标准化约束变化时，再迁移到 Chrome _locales/messages.json。",
    },
    extensionRoot,
    installI18n: {
      registeredButUnsupportedLocales: difference(
        installI18nRegisteredLocales,
        installI18nSupportedLocales,
      ),
      registeredLocales: installI18nRegisteredLocales,
      scriptExists: fileExists(installI18nPath),
      supportedButUnregisteredLocales: difference(
        installI18nSupportedLocales,
        installI18nRegisteredLocales,
      ),
      supportedLocales: installI18nSupportedLocales,
    },
    manifest,
    optionsPage: {
      scriptExists: fileExists(optionsScriptPath),
      supportedButMissingTranslations: difference(
        optionsSupportedLanguages,
        optionsTranslationLocales,
      ),
      supportedLanguages: optionsSupportedLanguages,
      translationButUnsupportedLanguages: difference(
        optionsTranslationLocales,
        optionsSupportedLanguages,
      ),
      translationLocales: optionsTranslationLocales,
    },
    pages,
    repoRoot,
    schemaVersion: "lime.i18n.chromeExtensionWorkflowReport.v1",
    summary: {
      dataI18nAttributeCount,
      htmlPageCount: pages.length,
      installI18nLocaleDriftCount:
        difference(installI18nSupportedLocales, installI18nRegisteredLocales)
          .length +
        difference(installI18nRegisteredLocales, installI18nSupportedLocales)
          .length,
      installI18nSupportedLocaleCount: installI18nSupportedLocales.length,
      manifestHasDefaultLocale: manifest.hasDefaultLocale,
      optionsLanguageDriftCount:
        difference(optionsSupportedLanguages, optionsTranslationLocales)
          .length +
        difference(optionsTranslationLocales, optionsSupportedLanguages).length,
      optionsSupportedLanguageCount: optionsSupportedLanguages.length,
      pageRegistryLocaleCount: pageRegistryLocales.length,
      standardChromeLocaleDecisionRecorded: true,
      standardChromeLocaleWorkflowRequired: false,
      standardChromeLocaleWorkflowPresent:
        manifest.hasDefaultLocale &&
        dirExists(localesDir) &&
        localeDirs.length > 0,
      terminologyPresentCount: terminology.filter((term) => term.present)
        .length,
    },
    terminology,
  };
}

export function formatChromeExtensionWorkflowReport(
  report: ChromeExtensionWorkflowReport,
  format: ChromeExtensionWorkflowReportFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const missingTerms = report.terminology
    .filter((term) => !term.present)
    .map((term) => term.term);
  const lines = [
    "[i18n:chrome-extension] workflow inventory",
    `extensionRoot: ${displayPath(report.extensionRoot, report.repoRoot)}`,
    `manifest default_locale: ${report.manifest.defaultLocale ?? "(missing)"}`,
    `Chrome _locales/: ${report.chromeLocales.localesDirExists ? "yes" : "no"}`,
    `InstallI18n supported locales: ${report.installI18n.supportedLocales.join(", ") || "(none)"}`,
    `InstallI18n registered locales: ${report.installI18n.registeredLocales.join(", ") || "(none)"}`,
    `InstallI18n locale drift: ${report.summary.installI18nLocaleDriftCount}`,
    `options supported languages: ${report.optionsPage.supportedLanguages.join(", ") || "(none)"}`,
    `options translation locales: ${report.optionsPage.translationLocales.join(", ") || "(none)"}`,
    `options language drift: ${report.summary.optionsLanguageDriftCount}`,
    `HTML pages: ${report.summary.htmlPageCount}`,
    `data-i18n attributes: ${report.summary.dataI18nAttributeCount}`,
    `terminology present: ${report.summary.terminologyPresentCount}/${report.terminology.length}`,
    `missing terminology: ${missingTerms.join(", ") || "(none)"}`,
    `standard Chrome locale workflow: ${report.summary.standardChromeLocaleWorkflowPresent ? "yes" : "no"}`,
    `standard Chrome locale decision: ${report.decision.status}`,
  ];

  return `${lines.join("\n")}\n`;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/i18n/i18n-chrome-extension-workflow-report.ts [options]

只读汇总 Chrome extension 的 i18n 事实源、页面 registry 与术语库存。
不会修改扩展文件，也不会打包或发布扩展。

Options:
  --format json|text       输出格式，默认 text
  --output <file>          将输出写入文件
  --repo-root <path>       指定仓库根目录，默认当前仓库
  --extension-root <path>  指定扩展目录，默认 extensions/lime-chrome
  --help, -h               显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions & { help?: boolean } {
  const options: CliOptions & { help?: boolean } = {
    format: "text",
    repoRoot: REPO_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--format") {
      const next = argv[index + 1];
      if (next !== "json" && next !== "text") {
        throw new Error("--format 只接受 json 或 text");
      }
      options.format = next;
      index += 1;
      continue;
    }
    if (arg === "--output") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--output 需要文件路径");
      }
      options.output = next;
      index += 1;
      continue;
    }
    if (arg === "--repo-root") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--repo-root 需要路径");
      }
      options.repoRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--extension-root") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--extension-root 需要路径");
      }
      options.extensionRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }

  return options;
}

export function runCli(argv: string[] = process.argv.slice(2)): number {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const report = analyzeChromeExtensionWorkflowReport({
    extensionRoot: options.extensionRoot,
    repoRoot: options.repoRoot,
  });
  const output = formatChromeExtensionWorkflowReport(report, options.format);

  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), {
      recursive: true,
    });
    fs.writeFileSync(path.resolve(options.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = runCli();
}
