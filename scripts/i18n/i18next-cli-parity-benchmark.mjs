#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CLI_VERSION = "1.58.0";

function parseArgs(argv) {
  const options = {
    cliVersion: DEFAULT_CLI_VERSION,
    output: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--cli-version" && next) {
      options.cliVersion = next;
      index += 1;
      continue;
    }

    if (arg === "--output" && next) {
      options.output = next;
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: npm run i18n:toolchain-benchmark -- [--cli-version <version>] [--output <file>]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-i18next-cli-parity-"),
  );
  const resourcesRoot = path.join(root, "src", "i18n", "resources");

  fs.mkdirSync(path.join(resourcesRoot, "zh-CN"), { recursive: true });
  fs.mkdirSync(path.join(resourcesRoot, "en-US"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "i18next.config.mjs"),
    `export default {
  locales: ["zh-CN", "en-US"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/i18n/resources/{{language}}/{{namespace}}.json"
  },
  types: {
    input: "src/i18n/resources/zh-CN/**/*.json",
    basePath: "src/i18n/resources/zh-CN",
    output: "src/types/i18next.d.ts",
    resourcesFile: "src/types/resources.d.ts"
  }
};
`,
  );
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "App.tsx"),
    `import { getFixedT, useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation("common");
  const agentT = getFixedT("en-US", "agentSkills");
  const localT = useTranslation("agentSkills", {
    keyPrefix: "skills.workspace.sidebar.local",
  }).t;

  return (
    <div>
      <button>{t("button.save")}</button>
      <span>{agentT("skills.workspace.sidebar.local.empty")}</span>
      <p>{localT("title")}</p>
      <em>Hardcoded UI text</em>
    </div>
  );
}
`,
  );

  writeJson(path.join(resourcesRoot, "zh-CN", "common.json"), {
    "button.cancel": "取消",
    "button.save": "保存",
  });
  writeJson(path.join(resourcesRoot, "en-US", "common.json"), {
    "button.cancel": "Cancel",
    "button.save": "Save",
  });
  writeJson(path.join(resourcesRoot, "zh-CN", "agentSkills.json"), {
    "skills.workspace.sidebar.local.empty": "当前还没有本地 Skill",
    "skills.workspace.sidebar.local.title": "本地 Skills",
  });
  writeJson(path.join(resourcesRoot, "en-US", "agentSkills.json"), {
    "skills.workspace.sidebar.local.empty": "No local Skills yet",
    "skills.workspace.sidebar.local.title": "Local Skills",
  });

  return {
    resourcesRoot,
    root,
  };
}

function runCommand({ args, command, cwd }) {
  try {
    const stdout = execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      exitCode: 0,
      stderr: "",
      stdout,
    };
  } catch (error) {
    return {
      exitCode: typeof error.status === "number" ? error.status : 1,
      stderr: String(error.stderr ?? ""),
      stdout: String(error.stdout ?? ""),
    };
  }
}

function runI18nextCli(fixtureRoot, cliVersion, args) {
  return runCommand({
    args: [
      "exec",
      "--yes",
      "--package",
      `i18next-cli@${cliVersion}`,
      "--",
      "i18next-cli",
      ...args,
    ],
    command: "npm",
    cwd: fixtureRoot,
  });
}

function runDetectTranslations(resourcesRoot) {
  return runCommand({
    args: [
      "tsx",
      path.join(REPO_ROOT, "scripts", "i18n", "detect-missing-translations.ts"),
      "--format",
      "json",
      "--resources-dir",
      resourcesRoot,
    ],
    command: "npx",
    cwd: REPO_ROOT,
  });
}

function runLimeUnused(resourcesRoot, sourceRoot) {
  return runCommand({
    args: [
      "tsx",
      path.join(REPO_ROOT, "scripts", "i18n", "i18n-unused-key-check.ts"),
      "--format",
      "json",
      "--resources-dir",
      resourcesRoot,
      "--source-dir",
      sourceRoot,
    ],
    command: "npx",
    cwd: REPO_ROOT,
  });
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function summarizeReport(commands, detectTranslations) {
  const detectReport = safeJsonParse(detectTranslations.stdout);
  const unusedReport = safeJsonParse(commands.unused.stdout);
  const statusText = `${commands.status.stdout}\n${commands.status.stderr}`;
  const lintText = `${commands.lint.stdout}\n${commands.lint.stderr}`;
  const extractText = `${commands.extractDryRun.stdout}\n${commands.extractDryRun.stderr}`;

  return {
    cliStatus: {
      exitCode: commands.status.exitCode,
      keysFound: Number(statusText.match(/Keys Found:\s+(\d+)/)?.[1] ?? 0),
      namespacesFound: Number(
        statusText.match(/Namespaces Found:\s+(\d+)/)?.[1] ?? 0,
      ),
      incompleteTranslations: commands.status.exitCode !== 0,
    },
    cliLint: {
      exitCode: commands.lint.exitCode,
      hardcodedIssueCount: countMatches(lintText, /Found hardcoded string:/g),
    },
    cliExtractDryRun: {
      exitCode: commands.extractDryRun.exitCode,
      updatedFileCount: countMatches(extractText, /^\s{2}\/.* \[[^\]]+\]/gm),
    },
    cliTypes: {
      exitCode: commands.types.exitCode,
      generatedResourcesFile: commands.types.stdout.includes(
        "Resources interface written",
      ),
      generatedI18nextTypes: commands.types.stdout.includes(
        "TypeScript definitions written",
      ),
    },
    limeDetectTranslations: {
      exitCode: detectTranslations.exitCode,
      hasIssues: Boolean(detectReport?.summary?.hasIssues),
      issueCount: Number(detectReport?.summary?.issueCount ?? 0),
      sourceKeyCount: Number(detectReport?.summary?.sourceKeyCount ?? 0),
    },
    limeUnused: {
      exitCode: commands.unused.exitCode,
      protectedKeyCount: Number(unusedReport?.summary?.protectedKeyCount ?? 0),
      unusedKeyCount: Number(unusedReport?.summary?.unusedKeyCount ?? 0),
      dynamicKeyPatternCount: Number(
        unusedReport?.summary?.dynamicKeyPatternCount ?? 0,
      ),
      topNamespace: unusedReport?.namespaceSummaries?.[0]?.namespace ?? "",
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixture = createFixture();
  const limeUnused = runLimeUnused(
    fixture.resourcesRoot,
    path.join(fixture.root, "src"),
  );
  const i18nextCliCommands = {
    extractDryRun: runI18nextCli(fixture.root, options.cliVersion, [
      "extract",
      "--dry-run",
      "--ci",
    ]),
    lint: runI18nextCli(fixture.root, options.cliVersion, ["lint"]),
    status: runI18nextCli(fixture.root, options.cliVersion, ["status"]),
    types: runI18nextCli(fixture.root, options.cliVersion, ["types"]),
  };
  const detectTranslations = runDetectTranslations(fixture.resourcesRoot);
  const report = {
    schemaVersion: "lime.i18n.i18nextCliParityBenchmark.v1",
    cliVersion: options.cliVersion,
    environment: {
      node: process.version,
      platform: process.platform,
    },
    fixture: {
      description:
        "Temp fixture with zh-CN/en-US resources, flat dotted keys, useTranslation namespace, getFixedT, keyPrefix, and one hardcoded JSX literal.",
      resourcesRoot: fixture.resourcesRoot,
    },
    summary: summarizeReport(
      { ...i18nextCliCommands, unused: limeUnused },
      detectTranslations,
    ),
    commands: {
      detectTranslations,
      limeUnused,
      i18nextCli: i18nextCliCommands,
    },
    decision: {
      current: "保留 Lime 自研 i18n 治理脚本为 current。",
      next: "只有在官方 CLI 对动态 key 保护、unused family 分桶和 Patch retirement gate 具备等价覆盖后，再评估替换最薄的 i18n:check 层。",
    },
  };

  const output = options.output ? path.resolve(options.output) : "";
  if (output) {
    writeJson(output, report);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export {
  runCommand,
  runDetectTranslations,
  runI18nextCli,
  runLimeUnused,
  summarizeReport,
};
