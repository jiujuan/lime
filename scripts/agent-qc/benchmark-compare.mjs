#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SUPERVISOR_OUTPUT_SCHEMA = {
  schemaVersion: "agent-qc-supervisor-verdict-v1",
  type: "object",
  required: [
    "score",
    "verdict",
    "regressions",
    "needsHumanReview",
    "reason",
  ],
  properties: {
    score: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    verdict: {
      enum: ["pass", "regression", "needs-human-review"],
    },
    regressions: {
      type: "array",
      items: {
        type: "string",
      },
    },
    needsHumanReview: {
      type: "boolean",
    },
    reason: {
      type: "string",
    },
  },
};

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

function readFirstJsonIfExists(paths) {
  for (const filePath of paths) {
    const payload = readJsonIfExists(filePath);
    if (payload) {
      return { filePath, payload };
    }
  }
  return null;
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

function readEvidencePayload(trialDir) {
  return readFirstJsonIfExists([
    path.join(trialDir, "evidence.json"),
    path.join(trialDir, "result.json"),
    path.join(trialDir, "artifacts/evidence.json"),
    path.join(trialDir, "artifacts/managed-objective-continuation-smoke.json"),
    path.join(trialDir, "verifier/reward-details.json"),
  ]);
}

function firstNonNull(...values) {
  return values.find((value) => value !== null && value !== undefined);
}

function readPath(object, pathSegments) {
  return pathSegments.reduce((current, segment) => {
    if (current === null || current === undefined) {
      return null;
    }
    return current[segment];
  }, object);
}

function extractDeterministicFacts(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const objective = payload.objective || {};
  const coverage = payload.coverage || {};
  const runtime = payload.runtime || {};
  const finalSnapshot = runtime.finalSnapshot || {};
  const evidencePack = payload.evidencePack || payload.evidence_pack || {};
  const guard = payload.guard || {};

  return {
    status: firstNonNull(payload.status, payload.verdict?.status),
    turnCount: firstNonNull(
      readPath(finalSnapshot, ["session", "turnCount"]),
      evidencePack.turnCount,
      evidencePack.turn_count,
      payload.turnCount,
      payload.turn_count,
    ),
    objectiveStatus: firstNonNull(
      objective.status,
      payload.objectiveStatus,
      payload.objective_status,
    ),
    guardDecision: firstNonNull(
      guard.finalDecision,
      guard.final_decision,
      payload.guardDecision,
      payload.guard_decision,
    ),
    autoContinuationObserved: firstNonNull(
      coverage.autoContinuationObserved,
      payload.autoContinuationObserved,
      payload.auto_continuation_observed,
    ),
    budgetLimitObserved: firstNonNull(
      coverage.budgetLimitObserved,
      payload.budgetLimitObserved,
      payload.budget_limit_observed,
    ),
    evidencePackExported: firstNonNull(
      coverage.evidencePackExported,
      Boolean(payload.evidencePack || payload.evidence_pack),
    ),
    pendingRequestCount: firstNonNull(
      readPath(finalSnapshot, ["thread", "pendingRequestCount"]),
      evidencePack.pendingRequestCount,
      evidencePack.pending_request_count,
    ),
  };
}

function diffDeterministicFacts(baselineFacts, candidateFacts) {
  const fields = Array.from(
    new Set([
      ...Object.keys(baselineFacts || {}),
      ...Object.keys(candidateFacts || {}),
    ]),
  ).sort();
  return fields
    .filter((field) => baselineFacts[field] !== candidateFacts[field])
    .map((field) => ({
      field,
      baseline: baselineFacts[field] ?? null,
      candidate: candidateFacts[field] ?? null,
    }));
}

function classifyScenarioDecision({ baseline, candidate, deterministicDiff }) {
  if (!baseline?.evidenceComplete || !candidate?.evidenceComplete) {
    return "needs-human-review";
  }
  if (
    candidate.reward !== null &&
    baseline.reward !== null &&
    candidate.reward < baseline.reward
  ) {
    return "regression";
  }
  if (
    candidate.facts?.status &&
    !["pass", "passed"].includes(String(candidate.facts.status).toLowerCase())
  ) {
    return "regression";
  }
  if (deterministicDiff.length > 0) {
    return "needs-human-review";
  }
  return "pass";
}

function shouldRequestSupervisorReview({
  baseline,
  candidate,
  decision,
  deterministicDiff,
}) {
  return Boolean(
    decision === "needs-human-review" &&
      deterministicDiff.length > 0 &&
      baseline?.evidenceComplete &&
      candidate?.evidenceComplete,
  );
}

function compactTrialSummary(trial) {
  if (!trial) {
    return null;
  }
  return {
    trialId: trial.trialId,
    reward: trial.reward,
    evidenceComplete: trial.evidenceComplete,
    evidenceRef: trial.refs?.evidenceRef || trial.evidenceRef || null,
    facts: trial.facts || {},
  };
}

function buildSupervisorReviewInput({
  scenarioId,
  baseline,
  candidate,
  deterministicDiff,
  semanticDiff,
}) {
  return {
    schemaVersion: "agent-qc-supervisor-review-input-v1",
    scenarioId,
    taskExpectation:
      "判断 candidate 相对 baseline 是否保持或改善 Agent 行为；只使用本对象中的摘要和 diff，不读取完整日志。",
    baselineEvidenceSummary: compactTrialSummary(baseline),
    candidateEvidenceSummary: compactTrialSummary(candidate),
    deterministicDiff,
    semanticDiff,
    rubric: {
      judgeOnly: [
        "candidate 的差异是否符合任务意图",
        "candidate 是否引入用户可感知退化",
        "deterministic diff 未能机械分类时，语义上是否仍可接受",
      ],
      doNotJudge: [
        "schema 是否注册",
        "命令是否存在",
        "GUI owner 是否独占",
        "Evidence Pack 是否导出",
        "完整 stdout / stderr 日志",
      ],
      passConditions: [
        "没有证据表明 candidate 退化",
        "deterministic diff 与预期策略一致",
        "不需要额外人工确认即可接受",
      ],
      humanReviewTriggers: [
        "baseline 或 candidate 证据不完整",
        "diff 只涉及投影文案或产品判断",
        "score 接近阈值",
      ],
    },
    outputSchema: SUPERVISOR_OUTPUT_SCHEMA,
  };
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
    const evidencePayload = readEvidencePayload(trialDir);
    const evidencePayloadComplete = Boolean(
      evidencePayload?.payload &&
        (evidencePayload.payload.status ||
          evidencePayload.payload.verdict ||
          evidencePayload.payload.scenarioId ||
          evidencePayload.payload.scenario_id),
    );
    const evidenceComplete =
      (reward != null &&
        fs.existsSync(trajectoryRef) &&
        fs.existsSync(rewardDetailsRef)) ||
      evidencePayloadComplete;
    return {
      trialId: path.basename(trialDir),
      reward,
      evidenceComplete,
      scenarioId:
        evidencePayload?.payload?.scenarioId ||
        evidencePayload?.payload?.scenario_id ||
        path.basename(trialDir),
      facts: extractDeterministicFacts(evidencePayload?.payload),
      refs: {
        trajectoryRef,
        rewardDetailsRef,
        artifactManifestRef,
        evidenceRef: evidencePayload?.filePath || null,
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

function compareScenarioTrials(baseline, candidate) {
  const baselineByScenario = new Map(
    baseline.trials.map((trial) => [trial.scenarioId, trial]),
  );
  return candidate.trials.map((candidateTrial) => {
    const baselineTrial =
      baselineByScenario.get(candidateTrial.scenarioId) ||
      baseline.trials.find((trial) => trial.trialId === candidateTrial.trialId) ||
      null;
    const deterministicDiff = diffDeterministicFacts(
      baselineTrial?.facts || {},
      candidateTrial.facts || {},
    );
    const rewardDelta =
      typeof candidateTrial.reward === "number" &&
      typeof baselineTrial?.reward === "number"
        ? candidateTrial.reward - baselineTrial.reward
        : null;
    const semanticDiff = {
      scoreDelta: rewardDelta,
      regressions:
        rewardDelta !== null && rewardDelta < 0 ? ["reward-regression"] : [],
    };
    const decision = classifyScenarioDecision({
      baseline: baselineTrial,
      candidate: candidateTrial,
      deterministicDiff,
    });
    const supervisorRequired = shouldRequestSupervisorReview({
      baseline: baselineTrial,
      candidate: candidateTrial,
      decision,
      deterministicDiff,
    });
    return {
      scenarioId: candidateTrial.scenarioId,
      baseline: baselineTrial
        ? {
            trialId: baselineTrial.trialId,
            reward: baselineTrial.reward,
            evidenceComplete: baselineTrial.evidenceComplete,
            evidenceRef: baselineTrial.refs.evidenceRef,
            facts: baselineTrial.facts,
          }
        : null,
      candidate: {
        trialId: candidateTrial.trialId,
        reward: candidateTrial.reward,
        evidenceComplete: candidateTrial.evidenceComplete,
        evidenceRef: candidateTrial.refs.evidenceRef,
        facts: candidateTrial.facts,
      },
      deterministicDiff,
      semanticDiff,
      supervisorReview: {
        required: supervisorRequired,
        reason: supervisorRequired
          ? "deterministic-diff-needs-semantic-review"
          : "not-required",
        input: supervisorRequired
          ? buildSupervisorReviewInput({
              scenarioId: candidateTrial.scenarioId,
              baseline: baselineTrial,
              candidate: candidateTrial,
              deterministicDiff,
              semanticDiff,
            })
          : null,
      },
      decision,
    };
  });
}

function compareJobs(baselineJobDir, candidateJobDir) {
  const baseline = summarizeJob(baselineJobDir);
  const candidate = summarizeJob(candidateJobDir);
  const scenarioDiffs = compareScenarioTrials(baseline, candidate);
  const regressionCount = scenarioDiffs.filter(
    (scenario) => scenario.decision === "regression",
  ).length;
  const needsHumanReviewCount = scenarioDiffs.filter(
    (scenario) => scenario.decision === "needs-human-review",
  ).length;
  const promotionEligible =
    candidate.meanReward >= baseline.meanReward &&
    candidate.evidenceCompletenessRate >= baseline.evidenceCompletenessRate &&
    regressionCount === 0;

  return {
    generatedAt: new Date().toISOString(),
    baseline,
    candidate,
    scenarioDiffs,
    comparison: {
      meanRewardDelta: candidate.meanReward - baseline.meanReward,
      evidenceCompletenessDelta:
        candidate.evidenceCompletenessRate - baseline.evidenceCompletenessRate,
      p0QcGateRegressionCount: regressionCount,
      needsHumanReviewCount,
      promotionEligible,
      decision: promotionEligible
        ? needsHumanReviewCount > 0
          ? "needs-human-review"
          : "pass"
        : "hold-or-revert",
    },
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
  const comparison = compareJobs(options.baseline, options.candidate);
  writeOutput(options.output, comparison);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  compareJobs,
  buildSupervisorReviewInput,
  diffDeterministicFacts,
  extractDeterministicFacts,
  shouldRequestSupervisorReview,
  summarizeJob,
  SUPERVISOR_OUTPUT_SCHEMA,
};
