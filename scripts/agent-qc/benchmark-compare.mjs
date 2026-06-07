#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    baseline: "",
    candidate: "",
    output: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--baseline" && argv[index + 1]) {
      options.baseline = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--candidate" && argv[index + 1]) {
      options.candidate = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      options.output = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.baseline || !options.candidate) {
    throw new Error("必须提供 --baseline 和 --candidate Harbor job 目录");
  }

  return options;
}

function printHelp() {
  console.log(`
Lime Harbor benchmark compare

用法:
  npm run agent-qc:benchmark:compare -- --baseline jobs/base --candidate jobs/candidate
  npm run agent-qc:benchmark:compare -- --baseline jobs/base --candidate jobs/candidate --output .lime/qc/benchmark/compare.json

说明:
  读取 Harbor job 目录下每个 trial 的 verifier/reward.txt 或 verifier/reward.json，产出 baseline/candidate aggregate delta。
`);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readReward(trialDir) {
  const rewardTxt = path.join(trialDir, "verifier/reward.txt");
  if (fs.existsSync(rewardTxt)) {
    const parsed = Number(fs.readFileSync(rewardTxt, "utf8").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const rewardJson = readJsonIfExists(
    path.join(trialDir, "verifier/reward.json"),
  );
  if (!rewardJson) {
    return null;
  }
  if (typeof rewardJson.reward === "number") {
    return rewardJson.reward;
  }

  const values = Object.values(rewardJson).filter(
    (value) => typeof value === "number",
  );
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function listTrialDirs(jobDir) {
  const resolved = path.resolve(process.cwd(), jobDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`job 目录不存在: ${jobDir}`);
  }
  return fs
    .readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resolved, entry.name))
    .filter(
      (trialDir) =>
        fs.existsSync(path.join(trialDir, "result.json")) ||
        fs.existsSync(path.join(trialDir, "verifier")),
    );
}

function summarizeJob(jobDir) {
  const trialDirs = listTrialDirs(jobDir);
  const trials = trialDirs.map((trialDir) => {
    const reward = readReward(trialDir);
    const rewardDetailsRef = path.join(
      trialDir,
      "verifier/reward-details.json",
    );
    const trajectoryRef = path.join(trialDir, "agent/trajectory.json");
    const artifactManifestRef = path.join(trialDir, "artifacts/manifest.json");
    const evidenceComplete =
      reward != null &&
      fs.existsSync(trajectoryRef) &&
      fs.existsSync(rewardDetailsRef);
    return {
      trialId: path.basename(trialDir),
      reward,
      evidenceComplete,
      refs: {
        trajectoryRef,
        rewardDetailsRef,
        artifactManifestRef,
      },
    };
  });

  const rewards = trials
    .map((trial) => trial.reward)
    .filter((value) => typeof value === "number");
  const meanReward =
    rewards.length > 0
      ? rewards.reduce((sum, value) => sum + value, 0) / rewards.length
      : 0;
  const evidenceCompletenessRate =
    trials.length > 0
      ? trials.filter((trial) => trial.evidenceComplete).length / trials.length
      : 0;

  return {
    jobDir,
    trialCount: trials.length,
    scoredTrialCount: rewards.length,
    meanReward,
    evidenceCompletenessRate,
    trials,
  };
}

function writeOutput(outputPath, payload) {
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const resolved = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseline = summarizeJob(options.baseline);
  const candidate = summarizeJob(options.candidate);
  const comparison = {
    generatedAt: new Date().toISOString(),
    baseline,
    candidate,
    comparison: {
      meanRewardDelta: candidate.meanReward - baseline.meanReward,
      evidenceCompletenessDelta:
        candidate.evidenceCompletenessRate - baseline.evidenceCompletenessRate,
      p0QcGateRegressionCount: null,
      promotionEligible:
        candidate.meanReward >= baseline.meanReward &&
        candidate.evidenceCompletenessRate >= baseline.evidenceCompletenessRate,
      decision:
        candidate.meanReward >= baseline.meanReward &&
        candidate.evidenceCompletenessRate >= baseline.evidenceCompletenessRate
          ? "needs-agent-qc-gate-check"
          : "hold-or-revert",
    },
  };
  writeOutput(options.output, comparison);
}

main();
