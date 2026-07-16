#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  captureProjectGateSurfaceContract,
  validateProjectGateCandidateDescriptor,
} from "../lib/project-gate-candidate-core.mjs";
import {
  buildProjectGateCoverage,
  collectProjectGateEvidence,
  readProjectGateSurfaceManifest,
} from "../lib/project-gate-coverage-core.mjs";

function printHelp() {
  console.log(`
Project Gate Surface Coverage

用法:
  npm run agent-qc:project-gate-coverage -- --candidate <candidate.json>

选项:
  --candidate <path>      schema v3 candidate JSON，必填
  --repo-root <path>      Git 仓库根目录，默认从 candidate 路径向上定位
  --evidence-root <path>  evidence 根目录，默认 candidate 所在目录
  --output <path>         coverage JSON，默认 <evidence-root>/coverage-summary.json
  --progress-only         未达到 34/34 时仍以 0 退出，仅用于过程报表
  -h, --help              显示帮助
`);
}

function parseArgs(argv) {
  const options = {
    candidate: null,
    repoRoot: null,
    evidenceRoot: null,
    output: null,
    progressOnly: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--candidate" && next) {
      options.candidate = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--repo-root" && next) {
      options.repoRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--evidence-root" && next) {
      options.evidenceRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--output" && next) {
      options.output = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--progress-only") {
      options.progressOnly = true;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  if (options.help) {
    return options;
  }
  if (!options.candidate) {
    throw new Error("--candidate 必填");
  }
  options.evidenceRoot ??= path.dirname(options.candidate);
  options.output ??= path.join(options.evidenceRoot, "coverage-summary.json");
  assertPathInside(options.evidenceRoot, options.output, "--output");
  if (path.resolve(options.output) === path.resolve(options.candidate)) {
    throw new Error("--output 不能覆盖 candidate");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const candidate = validateProjectGateCandidateDescriptor(
    JSON.parse(fs.readFileSync(options.candidate, "utf8")),
  );
  const repoRoot = options.repoRoot
    ? fs.realpathSync(options.repoRoot)
    : findGitRoot(path.dirname(options.candidate));
  const surfaceContract = captureProjectGateSurfaceContract({ repoRoot });
  if (
    surfaceContract.path !== candidate.surface_contract.path ||
    surfaceContract.digest !== candidate.surface_contract.digest
  ) {
    throw new Error("candidate surface contract 与当前 manifest 不匹配");
  }
  const manifest = readProjectGateSurfaceManifest(
    path.resolve(repoRoot, candidate.surface_contract.path),
  );
  const evidenceRecords = collectProjectGateEvidence({
    evidenceRoot: options.evidenceRoot,
    outputPath: options.output,
  });
  const coverage = buildProjectGateCoverage({
    candidateRunId: candidate.run_id,
    manifest,
    evidenceRecords,
  });
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  const temporaryOutput = `${options.output}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryOutput, `${JSON.stringify(coverage, null, 2)}\n`);
  fs.renameSync(temporaryOutput, options.output);
  console.log(
    `[agent-qc:project-gate-coverage] status=${coverage.status} completion=${coverage.completion.complete}/${coverage.completion.total} (${coverage.completion.percent}%) evidence=${coverage.evidence.recognized}`,
  );
  if (!options.progressOnly && coverage.status !== "complete") {
    process.exitCode = 1;
  }
}

function findGitRoot(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return fs.realpathSync(current);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("无法从 candidate 路径定位 Git 仓库根目录");
    }
    current = parent;
  }
}

function assertPathInside(root, target, label) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} 必须位于 evidence root 内`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[agent-qc:project-gate-coverage] ${error.message}`);
  process.exitCode = 1;
}
