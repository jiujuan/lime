import { describe, expect, it } from "vitest";

import {
  buildQCLoopJobPayload,
  renderQCLoopCurl,
  selectScenarios,
  validateQCLoopJobPayload,
} from "./agent-qc-qcloop-job-core.mjs";

const manifest = {
  qcloop: {
    recommendedMaxQcRounds: 3,
    workerPromptTemplate: "worker {{item}}",
    verifierPromptTemplate: "verifier {{item}}",
  },
  scenarios: [
    {
      id: "command-bridge-contract",
      title: "命令桥接四侧一致",
      risk: "P0",
      executor: "npm_command",
      lanes: ["L1-contract-bridge"],
      commands: ["npm run test:contracts"],
      goal: "goal",
      verifier: "verifier",
      evidenceRequired: ["evidence"],
      evidenceLayers: ["deterministic-smoke"],
      failureModes: ["failure"],
    },
    {
      id: "knowledge-ingest-retrieve-summarize",
      title: "Knowledge",
      risk: "P1",
      executor: "mixed",
      lanes: ["L3-product-surface"],
      goal: "goal",
      verifier: "verifier",
      evidenceRequired: ["evidence"],
      failureModes: ["failure"],
    },
  ],
};

describe("agent-qc-qcloop-job-core", () => {
  it("默认应选择 P0 场景", () => {
    const scenarios = selectScenarios(manifest);

    expect(scenarios.map((scenario) => scenario.id)).toEqual(["command-bridge-contract"]);
  });

  it("应按风险等级生成 qcloop job payload", () => {
    const payload = buildQCLoopJobPayload(manifest, {
      risks: ["P1"],
      cwd: "/workspace/lime",
      generatedAt: "2026-05-10T00:00:00.000Z",
      maxExecutorRetries: 0,
    });

    expect(payload.name).toBe("lime-agent-qc-p1-2026-05-10");
    expect(payload.prompt_template).toContain("目标仓库 cwd: /workspace/lime");
    expect(payload.prompt_template).toContain("QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED");
    expect(payload.prompt_template).toContain("QCLOOP_EVIDENCE_SUMMARY_JSON=");
    expect(payload.items).toHaveLength(1);
    expect(payload.max_executor_retries).toBe(0);
    expect(payload.verifier_prompt_template).toContain("{{stdout}}");
    expect(payload.verifier_prompt_template).toContain("{{exit_code}}");
    expect(payload.verifier_prompt_template).toContain("{{issue_ledger}}");
    expect(payload.verifier_prompt_template).toContain("QCLOOP_EVIDENCE_SUMMARY_JSON");
    expect(payload.verifier_prompt_template).toContain('{"pass": true|false');
    expect(JSON.parse(payload.items[0]).scenario_id).toBe(
      "knowledge-ingest-retrieve-summarize",
    );
    expect(JSON.parse(payload.items[0]).cwd).toBe("/workspace/lime");
    expect(validateQCLoopJobPayload(payload).valid).toBe(true);
  });

  it("应把 evidenceLayers 带入 qcloop item，方便 worker 声明证据深度", () => {
    const payload = buildQCLoopJobPayload(manifest, {
      scenarioIds: ["command-bridge-contract"],
    });

    expect(JSON.parse(payload.items[0]).evidence_layers).toEqual([
      "deterministic-smoke",
    ]);
  });

  it("应支持按 scenario id 精确选择", () => {
    const payload = buildQCLoopJobPayload(manifest, {
      scenarioIds: ["command-bridge-contract"],
      name: "selected-job",
    });

    expect(payload.name).toBe("selected-job");
    expect(payload.items).toHaveLength(1);
    expect(JSON.parse(payload.items[0]).scenario_id).toBe("command-bridge-contract");
  });

  it("validateQCLoopJobPayload 应阻止缺少 verifier stdout 占位符的 payload", () => {
    const payload = buildQCLoopJobPayload(manifest);
    payload.verifier_prompt_template = "verifier {{item}}";

    const validation = validateQCLoopJobPayload(payload);

    expect(validation.valid).toBe(false);
    expect(validation.issues.join("\n")).toContain("{{stdout}}");
  });

  it("validateQCLoopJobPayload 应阻止缺少结构化证据契约的 payload", () => {
    const payload = buildQCLoopJobPayload(manifest);
    payload.prompt_template = "worker {{item}}";
    payload.verifier_prompt_template =
      "verifier {{item}} status={{attempt_status}} code={{exit_code}} stdout={{stdout}} ledger={{issue_ledger}}";

    const validation = validateQCLoopJobPayload(payload);

    expect(validation.valid).toBe(false);
    expect(validation.issues.join("\n")).toContain("QCLOOP_EVIDENCE_SUMMARY_JSON=");
  });

  it("validateQCLoopJobPayload 应阻止非法 max_executor_retries", () => {
    const payload = buildQCLoopJobPayload(manifest);
    payload.max_executor_retries = 6;

    const validation = validateQCLoopJobPayload(payload);

    expect(validation.valid).toBe(false);
    expect(validation.issues.join("\n")).toContain("max_executor_retries");
  });

  it("verifier_prompt_template 不应重复追加已有 stdout 占位符的模板", () => {
    const payload = buildQCLoopJobPayload(
      {
        ...manifest,
        qcloop: {
          ...manifest.qcloop,
          verifierPromptTemplate: "verifier {{item}} stdout={{stdout}}",
        },
      },
      { scenarioIds: ["command-bridge-contract"] },
    );

    expect(payload.verifier_prompt_template.match(/{{stdout}}/g)).toHaveLength(1);
  });

  it("应生成可复制的 curl 命令", () => {
    const payload = buildQCLoopJobPayload(manifest);
    const curl = renderQCLoopCurl(payload, { baseUrl: "http://localhost:8080" });

    expect(curl).toContain("POST \"http://localhost:8080/api/jobs\"");
    expect(curl).toContain("command-bridge-contract");
  });

  it("默认 curl 应使用 IPv4 loopback，避免 localhost 代理或 IPv6 解析干扰", () => {
    const payload = buildQCLoopJobPayload(manifest);
    const curl = renderQCLoopCurl(payload);

    expect(curl).toContain("POST \"http://127.0.0.1:8080/api/jobs\"");
  });
});
