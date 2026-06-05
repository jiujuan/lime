#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const sourceRoots = ["src"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirectories = new Set([
  ".git",
  ".idea",
  ".vscode",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "target",
]);

const frontendCommandPatterns = [
  /\bsafeInvoke(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /\binvoke(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /\binvokeAgentRuntimeBridge(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
];

const knownDeferredRegistrationReasons = new Map();

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isRuntimeSource(relativePath) {
  const normalizedPath = normalizePath(relativePath);
  const extension = path.extname(normalizedPath);
  if (!sourceExtensions.has(extension)) {
    return false;
  }
  if (normalizedPath.endsWith(".d.ts")) {
    return false;
  }
  if (
    normalizedPath.includes("/__tests__/") ||
    normalizedPath.includes("/__mocks__/") ||
    /\.test\.[^.]+$/.test(normalizedPath) ||
    /\.spec\.[^.]+$/.test(normalizedPath)
  ) {
    return false;
  }
  return true;
}

function walkDirectory(rootDirectory) {
  const results = [];
  if (!fs.existsSync(rootDirectory)) {
    return results;
  }

  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDirectory(absolutePath));
      continue;
    }

    const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
    if (isRuntimeSource(relativePath)) {
      results.push(relativePath);
    }
  }

  return results;
}

function addUsage(map, command, relativePath) {
  if (!map.has(command)) {
    map.set(command, new Set());
  }
  map.get(command).add(relativePath);
}

function isFrameworkPluginCommand(command) {
  return command.startsWith("plugin:");
}

function extractCommandsFromSource(sourceCode) {
  const commands = new Set();
  for (const pattern of frontendCommandPatterns) {
    for (const match of sourceCode.matchAll(pattern)) {
      const command = match[1];
      if (isFrameworkPluginCommand(command)) {
        continue;
      }
      commands.add(command);
    }
  }
  return commands;
}

function collectFrontendCommandUsage() {
  const commandUsage = new Map();
  for (const root of sourceRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    for (const relativePath of walkDirectory(absoluteRoot)) {
      const absolutePath = path.join(repoRoot, relativePath);
      const sourceCode = fs.readFileSync(absolutePath, "utf8");
      for (const command of extractCommandsFromSource(sourceCode)) {
        addUsage(commandUsage, command, relativePath);
      }
    }
  }
  return commandUsage;
}

function collectAgentRuntimeSchemaUsage() {
  const commandUsage = new Map();
  const schemaPath = path.join(
    repoRoot,
    "src/lib/governance/agentRuntimeCommandSchema.json",
  );
  if (!fs.existsSync(schemaPath)) {
    return commandUsage;
  }

  const relativePath = normalizePath(path.relative(repoRoot, schemaPath));
  const parsed = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const schemaCommands = Array.isArray(parsed?.commands) ? parsed.commands : [];

  for (const entry of schemaCommands) {
    const command = String(entry?.command ?? "").trim();
    if (!command) {
      continue;
    }
    addUsage(commandUsage, command, relativePath);
  }

  return commandUsage;
}

function extractBalancedBlock(sourceCode, startIndex, openChar, closeChar) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = startIndex; index < sourceCode.length; index += 1) {
    const currentChar = sourceCode[index];
    const nextChar = sourceCode[index + 1];

    if (inLineComment) {
      if (currentChar === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (currentChar === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escaped && currentChar === "'") {
        inSingleQuote = false;
      }
      escaped = !escaped && currentChar === "\\";
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && currentChar === '"') {
        inDoubleQuote = false;
      }
      escaped = !escaped && currentChar === "\\";
      continue;
    }

    if (inTemplateString) {
      if (!escaped && currentChar === "`") {
        inTemplateString = false;
      }
      escaped = !escaped && currentChar === "\\";
      continue;
    }

    if (currentChar === "/" && nextChar === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (currentChar === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (currentChar === "'") {
      inSingleQuote = true;
      escaped = false;
      continue;
    }

    if (currentChar === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }

    if (currentChar === "`") {
      inTemplateString = true;
      escaped = false;
      continue;
    }

    if (currentChar === openChar) {
      depth += 1;
      continue;
    }

    if (currentChar === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return sourceCode.slice(startIndex + 1, index);
      }
    }
  }

  throw new Error(`无法提取 ${openChar}${closeChar} 平衡块`);
}

function collectElectronHostCommands() {
  const channelsPath = path.join(repoRoot, "electron/ipcChannels.ts");
  const sourceCode = fs.readFileSync(channelsPath, "utf8");
  const marker = "export const ELECTRON_HOST_COMMANDS = [";
  const markerIndex = sourceCode.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("未找到 Electron host command 白名单");
  }

  const bracketStart = markerIndex + marker.length - 1;
  const commandBody = extractBalancedBlock(sourceCode, bracketStart, "[", "]");
  const commands = new Set();

  for (const match of commandBody.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    commands.add(match[1]);
  }

  return commands;
}

function collectMockPriorityCommands() {
  const filePath = path.join(
    repoRoot,
    "src/lib/dev-bridge/mockPriorityCommands.ts",
  );
  const sourceCode = fs.readFileSync(filePath, "utf8");
  const match = sourceCode.match(
    /const mockPriorityCommands = new Set<string>\(\[([\s\S]*?)\]\);/,
  );
  if (!match) {
    throw new Error("未找到 mockPriorityCommands 定义");
  }

  const commands = new Set();
  for (const stringMatch of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
    commands.add(stringMatch[1]);
  }
  return commands;
}

function collectDefaultMockCommands() {
  const filePath = path.join(repoRoot, "src/lib/desktop-host/core.ts");
  const sourceCode = fs.readFileSync(filePath, "utf8");
  const marker = "const defaultMocks: Record<string, any> = {";
  const markerIndex = sourceCode.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("未找到 desktop-host defaultMocks 定义");
  }

  const braceStart = markerIndex + marker.length - 1;
  const objectBody = extractBalancedBlock(sourceCode, braceStart, "{", "}");
  const mockCommands = new Set();

  for (const match of objectBody.matchAll(/^  ([A-Za-z0-9_]+)\s*:/gm)) {
    mockCommands.add(match[1]);
  }
  for (const spreadMatch of objectBody.matchAll(
    /^  \.\.\.([A-Za-z0-9_]+),/gm,
  )) {
    const registryName = spreadMatch[1];
    for (const command of collectSpreadMockRegistryCommands(
      sourceCode,
      registryName,
    )) {
      mockCommands.add(command);
    }
  }

  return mockCommands;
}

function collectSpreadMockRegistryCommands(sourceCode, registryName) {
  const importPattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'`]([^"'`]+)["'`]/g;
  let importSource;
  for (const importMatch of sourceCode.matchAll(importPattern)) {
    const namedImports = importMatch[1];
    if (new RegExp(`\\b${registryName}\\b`).test(namedImports)) {
      importSource = importMatch[2];
      break;
    }
  }
  if (!importSource?.startsWith("./")) {
    return [];
  }

  const registrySourcePath = path.resolve(
    repoRoot,
    "src/lib/desktop-host",
    `${importSource.replace(/^\.\//, "")}.ts`,
  );
  if (!fs.existsSync(registrySourcePath)) {
    throw new Error(`未找到 spread mock registry 文件: ${registrySourcePath}`);
  }

  const registrySourceCode = fs.readFileSync(registrySourcePath, "utf8");
  const markerPattern = new RegExp(
    `export\\s+const\\s+${registryName}\\b[\\s\\S]*?=\\s*\\{`,
  );
  const markerMatch = markerPattern.exec(registrySourceCode);
  if (!markerMatch) {
    throw new Error(`未找到 spread mock registry 定义: ${registryName}`);
  }

  const braceStart = markerMatch.index + markerMatch[0].length - 1;
  const registryBody = extractBalancedBlock(
    registrySourceCode,
    braceStart,
    "{",
    "}",
  );
  const commands = [];
  for (const match of registryBody.matchAll(/^  ([A-Za-z0-9_]+)\s*:/gm)) {
    commands.push(match[1]);
  }
  return commands;
}

function readAgentCommandCatalog() {
  const catalogPath = path.join(
    repoRoot,
    "src/lib/governance/agentCommandCatalog.json",
  );
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

function sortCommands(commands) {
  return [...commands].sort((left, right) => left.localeCompare(right));
}

function printCommandGroup(title, commands, usageMap) {
  console.error(`\n## ${title}`);
  for (const command of sortCommands(commands)) {
    console.error(`- ${command}`);
    if (usageMap?.has(command)) {
      const files = sortCommands(usageMap.get(command));
      for (const file of files) {
        console.error(`  - ${file}`);
      }
    }
  }
}

function main() {
  const frontendUsage = collectFrontendCommandUsage();
  const agentRuntimeSchemaUsage = collectAgentRuntimeSchemaUsage();
  for (const [command, files] of agentRuntimeSchemaUsage.entries()) {
    for (const file of files) {
      addUsage(frontendUsage, command, file);
    }
  }
  const frontendCommands = new Set(frontendUsage.keys());
  const registeredCommands = collectElectronHostCommands();
  const mockPriorityCommands = collectMockPriorityCommands();
  const defaultMockCommands = collectDefaultMockCommands();
  const agentCommandCatalog = readAgentCommandCatalog();

  const deprecatedCommands = new Set(
    Object.keys(agentCommandCatalog.deprecatedCommandReplacements ?? {}),
  );
  const runtimeGatewayCommands = new Set(
    agentCommandCatalog.runtimeGatewayCommands ?? [],
  );
  const capabilityDraftCommands = new Set(
    agentCommandCatalog.capabilityDraftCommands ?? [],
  );

  const deferredCommands = new Set(knownDeferredRegistrationReasons.keys());

  const missingRegistrations = new Set(
    [...frontendCommands].filter(
      (command) =>
        !registeredCommands.has(command) && !deferredCommands.has(command),
    ),
  );
  const deprecatedCommandsStillUsed = new Set(
    [...frontendCommands].filter((command) => deprecatedCommands.has(command)),
  );
  const mockPriorityMissingMocks = new Set(
    [...mockPriorityCommands].filter(
      (command) => !defaultMockCommands.has(command),
    ),
  );
  const mockPriorityMissingRegistrations = new Set(
    [...mockPriorityCommands].filter(
      (command) =>
        !registeredCommands.has(command) && !deferredCommands.has(command),
    ),
  );
  const runtimeGatewayMissingRegistrations = new Set(
    [...runtimeGatewayCommands].filter(
      (command) =>
        !registeredCommands.has(command) && !deferredCommands.has(command),
    ),
  );
  const capabilityDraftMissingRegistrations = new Set(
    [...capabilityDraftCommands].filter(
      (command) =>
        !registeredCommands.has(command) && !deferredCommands.has(command),
    ),
  );

  console.log("[command-contracts] frontend commands:", frontendCommands.size);
  console.log(
    "[command-contracts] Electron host commands:",
    registeredCommands.size,
  );
  console.log(
    "[command-contracts] mock priority commands:",
    mockPriorityCommands.size,
  );
  console.log(
    "[command-contracts] default mock commands:",
    defaultMockCommands.size,
  );

  if (knownDeferredRegistrationReasons.size > 0) {
    console.log("\n[command-contracts] 已登记的延期命令：");
    for (const command of sortCommands(
      knownDeferredRegistrationReasons.keys(),
    )) {
      console.log(`- ${command}`);
      console.log(`  ${knownDeferredRegistrationReasons.get(command)}`);
    }
  }

  let hasError = false;

  if (missingRegistrations.size > 0) {
    hasError = true;
    printCommandGroup("前端调用但 Electron host 未承接的命令", missingRegistrations, frontendUsage);
  }

  if (deprecatedCommandsStillUsed.size > 0) {
    hasError = true;
    printCommandGroup(
      "前端仍在调用的废弃命令",
      deprecatedCommandsStillUsed,
      frontendUsage,
    );
  }

  if (mockPriorityMissingMocks.size > 0) {
    hasError = true;
    printCommandGroup("mock 优先命令缺少 mock 实现", mockPriorityMissingMocks);
  }

  if (mockPriorityMissingRegistrations.size > 0) {
    hasError = true;
    printCommandGroup("mock 优先命令缺少 Electron host 承接", mockPriorityMissingRegistrations);
  }

  if (runtimeGatewayMissingRegistrations.size > 0) {
    hasError = true;
    printCommandGroup("runtime gateway 命令缺少 Electron host 承接", runtimeGatewayMissingRegistrations);
  }

  if (capabilityDraftMissingRegistrations.size > 0) {
    hasError = true;
    printCommandGroup("capability draft 命令缺少 Electron host 承接", capabilityDraftMissingRegistrations);
  }

  if (hasError) {
    process.exitCode = 1;
    return;
  }

  console.log("\n[command-contracts] 所有命令契约检查通过。");
}

main();
