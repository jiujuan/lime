#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type AppMetadataWorkflowReportFormat = "text" | "json";

export interface AppMetadataWorkflowReport {
  appPackageJson: {
    description: string | null;
    name: string | null;
    version: string | null;
  };
  headlessTauriConfig: {
    identifier: string | null;
    productName: string | null;
    title: string | null;
  };
  repoRoot: string;
  shellCapability: {
    description: string | null;
    identifier: string | null;
  };
  srcTauriCargoToml: {
    description: string | null;
    homepage: string | null;
    packageVersion: string | null;
    workspaceVersion: string | null;
  };
  tauriConfig: {
    bundleTargets: string | null;
    deepLinkSchemes: string[];
    identifier: string | null;
    productName: string | null;
    title: string | null;
    updaterPubkeyPlaceholder: boolean;
  };
  schemaVersion: string;
  summary: {
    hasInstallerLocalizationWorkflow: boolean;
    hasLocalizedAppMetadataArtifacts: boolean;
    hasLocalizedMetadataFields: boolean;
    hasLocaleAwareMetadataSources: boolean;
  };
}

interface CliOptions {
  format: AppMetadataWorkflowReportFormat;
  output?: string;
  repoRoot: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return parsed;
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function readText(filePath: string): string | null {
  return fileExists(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function parseTomlSectionValue(
  content: string,
  sectionName: string,
  key: string,
): string | null {
  const sectionPattern = new RegExp(
    String.raw`^\[${sectionName.replaceAll(".", "\\.")}\]\s*$([\s\S]*?)(?=^\s*\[[^\]]+\]\s*$|$)`,
    "m",
  );
  const sectionMatch = content.match(sectionPattern);
  const sectionContent = sectionMatch?.[1] ?? "";
  const keyPattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"$`, "m");
  const match = sectionContent.match(keyPattern);
  return match ? match[1] ?? null : null;
}

function parseTauriBundleTargets(config: Record<string, unknown>): string | null {
  const bundle = isRecord(config.bundle) ? config.bundle : null;
  const targets = bundle?.targets;
  if (typeof targets === "string") {
    return targets;
  }
  if (Array.isArray(targets)) {
    return targets.join(", ");
  }
  return null;
}

function readPackageJson(filePath: string): AppMetadataWorkflowReport["appPackageJson"] {
  if (!fileExists(filePath)) {
    return { description: null, name: null, version: null };
  }
  const json = readJsonObject(filePath);
  return {
    description: typeof json.description === "string" ? json.description : null,
    name: typeof json.name === "string" ? json.name : null,
    version: typeof json.version === "string" ? json.version : null,
  };
}

function readCargoToml(filePath: string): AppMetadataWorkflowReport["srcTauriCargoToml"] {
  if (!fileExists(filePath)) {
    return {
      description: null,
      homepage: null,
      packageVersion: null,
      workspaceVersion: null,
    };
  }
  const content = fs.readFileSync(filePath, "utf8");
  return {
    description: parseTomlSectionValue(content, "package", "description"),
    homepage: parseTomlSectionValue(content, "package", "homepage"),
    packageVersion: parseTomlSectionValue(content, "package", "version"),
    workspaceVersion: parseTomlSectionValue(content, "workspace.package", "version"),
  };
}

function readTauriConfig(filePath: string): AppMetadataWorkflowReport["tauriConfig"] {
  if (!fileExists(filePath)) {
    return {
      bundleTargets: null,
      deepLinkSchemes: [],
      identifier: null,
      productName: null,
      title: null,
      updaterPubkeyPlaceholder: false,
    };
  }
  const json = readJsonObject(filePath);
  const app = isRecord(json.app) ? json.app : null;
  const windows = Array.isArray(app?.windows) ? app?.windows : [];
  const firstWindow = windows.length > 0 && isRecord(windows[0]) ? windows[0] : null;
  const bundle = isRecord(json.bundle) ? json.bundle : null;
  const plugins = isRecord(json.plugins) ? json.plugins : null;
  const updater = isRecord(plugins?.updater) ? plugins?.updater : null;
  const deepLink = isRecord(plugins?.["deep-link"]) ? plugins?.["deep-link"] : null;
  const desktop = isRecord(deepLink?.desktop) ? deepLink.desktop : null;

  return {
    bundleTargets: parseTauriBundleTargets(json),
    deepLinkSchemes: Array.isArray(desktop?.schemes)
      ? desktop.schemes.filter((value): value is string => typeof value === "string")
      : [],
    identifier: typeof json.identifier === "string" ? json.identifier : null,
    productName: typeof json.productName === "string" ? json.productName : null,
    title: typeof firstWindow?.title === "string" ? firstWindow.title : null,
    updaterPubkeyPlaceholder: typeof updater?.pubkey === "string" && updater.pubkey.includes("placeholder"),
  };
}

function readShellCapability(filePath: string): AppMetadataWorkflowReport["shellCapability"] {
  if (!fileExists(filePath)) {
    return { description: null, identifier: null };
  }
  const json = readJsonObject(filePath);
  return {
    description: typeof json.description === "string" ? json.description : null,
    identifier: typeof json.identifier === "string" ? json.identifier : null,
  };
}

export function analyzeAppMetadataWorkflowReport(
  options: Pick<CliOptions, "repoRoot">,
): AppMetadataWorkflowReport {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const appPackageJsonPath = path.join(repoRoot, "package.json");
  const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
  const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
  const tauriHeadlessConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.headless.json");
  const shellCapabilityPath = path.join(
    repoRoot,
    "src-tauri",
    "capabilities",
    "agent-app-shell.json",
  );

  const appPackageJson = readPackageJson(appPackageJsonPath);
  const cargoToml = readCargoToml(cargoTomlPath);
  const tauriConfig = readTauriConfig(tauriConfigPath);
  const headlessConfig = readTauriConfig(tauriHeadlessConfigPath);
  const shellCapability = readShellCapability(shellCapabilityPath);

  const localeAwareMetadataSources = [
    path.join(repoRoot, "README.en.md"),
    path.join(repoRoot, "docs", "roadmap", "i18n", "glossary.md"),
    path.join(repoRoot, "docs", "roadmap", "i18n", "release-docs-workflow-evaluation.md"),
  ].filter(fileExists);

  const localizedMetadataFields = [
    appPackageJson.description,
    cargoToml.description,
    tauriConfig.productName,
    tauriConfig.title,
    headlessConfig.productName,
    headlessConfig.title,
    shellCapability.description,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return {
    appPackageJson,
    headlessTauriConfig: {
      identifier: headlessConfig.identifier,
      productName: headlessConfig.productName,
      title: headlessConfig.title,
    },
    repoRoot,
    shellCapability,
    srcTauriCargoToml: cargoToml,
    tauriConfig,
    schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
    summary: {
      hasInstallerLocalizationWorkflow: false,
      hasLocalizedAppMetadataArtifacts: localizedMetadataFields.length > 0,
      hasLocalizedMetadataFields: localizedMetadataFields.length > 0,
      hasLocaleAwareMetadataSources: localeAwareMetadataSources.length > 0,
    },
  };
}

export function formatAppMetadataWorkflowReport(
  report: AppMetadataWorkflowReport,
  format: AppMetadataWorkflowReportFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "[i18n:app-metadata] workflow inventory",
    `repoRoot: ${normalizePath(report.repoRoot)}`,
    `localized metadata artifacts: ${report.summary.hasLocalizedAppMetadataArtifacts ? "yes" : "no"}`,
    `installer localization workflow: ${report.summary.hasInstallerLocalizationWorkflow ? "yes" : "no"}`,
    `locale-aware sources: ${report.summary.hasLocaleAwareMetadataSources ? "yes" : "no"}`,
    `package name/version: ${report.appPackageJson.name ?? "(missing)"} / ${report.appPackageJson.version ?? "(missing)"}`,
    `root description: ${report.appPackageJson.description ?? "(missing)"}`,
    `tauri productName/title: ${report.tauriConfig.productName ?? "(missing)"} / ${report.tauriConfig.title ?? "(missing)"}`,
    `tauri identifier: ${report.tauriConfig.identifier ?? "(missing)"}`,
    `bundle targets: ${report.tauriConfig.bundleTargets ?? "(missing)"}`,
    `deep link schemes: ${report.tauriConfig.deepLinkSchemes.join(", ") || "(none)"}`,
    `headless productName/title: ${report.headlessTauriConfig.productName ?? "(missing)"} / ${report.headlessTauriConfig.title ?? "(missing)"}`,
    `shell capability: ${report.shellCapability.identifier ?? "(missing)"}`,
  ];

  return `${lines.join("\n")}\n`;
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/i18n-app-metadata-workflow-report.ts [options]

只读汇总 installer / app metadata 是否已经具备独立翻译工作流。
不会修改文件，也不会打包或发布产物。

Options:
  --format json|text   输出格式，默认 text
  --output <file>      将输出写入文件
  --repo-root <path>   指定仓库根目录，默认当前仓库
  --help, -h           显示帮助
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

  const report = analyzeAppMetadataWorkflowReport({
    repoRoot: options.repoRoot,
  });
  const output = formatAppMetadataWorkflowReport(report, options.format);

  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(path.resolve(options.output), output, "utf8");
  } else {
    process.stdout.write(output);
  }

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = runCli();
}
