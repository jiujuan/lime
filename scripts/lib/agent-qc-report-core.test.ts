import { describe, expect, it } from "vitest";

import {
  collectNpmScriptName,
  createAgentQcReport,
  renderAgentQcMarkdownReport,
  validateAgentQcManifest,
} from "./agent-qc-report-core.mjs";

const packageJson = {
  scripts: {
    "verify:local": "node scripts/local-ci.mjs",
    "test:contracts": "node scripts/check-command-contracts.mjs",
    "verify:gui-smoke": "node scripts/verify-gui-smoke.mjs",
  },
};

const evidenceSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://lime.local/agent-qc-evidence.schema.json",
  type: "object",
  required: [
    "schemaVersion",
    "runId",
    "generatedAt",
    "subject",
    "laneResults",
    "scenarioResults",
    "verdict",
  ],
  properties: {
    verdict: {
      type: "object",
      properties: {
        status: {
          enum: ["pass", "fail", "blocked", "needs-human-review", "waived"],
        },
      },
    },
  },
};

const validManifest = {
  manifestVersion: "v1",
  title: "Lime Agent QC",
  evidenceSchema: "docs/test/agent-qc-evidence.schema.json",
  qcloop: {
    workerPromptTemplate:
      "worker {{item}} evidence_required failure_modes QCLOOP_WORKER_RESULT=BLOCKED QCLOOP_EVIDENCE_SUMMARY_JSON",
    verifierPromptTemplate:
      'verifier {{item}} status={{attempt_status}} code={{exit_code}} stdout={{stdout}} ledger={{issue_ledger}} QCLOOP_EVIDENCE_SUMMARY_JSON，只输出 {"pass": true|false, "feedback": "..."} JSON',
  },
  lanes: [
    {
      id: "L0-static-unit",
      title: "快速卫生",
      objective: "验证低级错误不会进入主链。",
      gatePolicy: "所有 PR 默认执行。",
      defaultCommands: ["npm run verify:local"],
    },
    {
      id: "L1-contract-bridge",
      title: "契约桥接",
      objective: "验证命令和 Bridge 合同不漂移。",
      gatePolicy: "命令和 Bridge 改动必跑。",
      defaultCommands: ["npm run test:contracts"],
    },
  ],
  scenarios: [
    {
      id: "command-bridge-contract",
      title: "命令桥接合同",
      risk: "P0",
      executor: "npm_command",
      lanes: ["L1-contract-bridge"],
      commands: ["npm run test:contracts"],
      goal: "前端调用、Rust 注册、治理目录册、mock 四侧一致。",
      verifier: "test:contracts 成功且没有新增 dead/compat 回流。",
      evidenceRequired: ["command log", "contract summary"],
      evidenceLayers: ["deterministic-smoke"],
      failureModes: ["missing rust handler", "mock fallback drift"],
    },
  ],
};

describe("agent-qc-report-core", () => {
  it("能从 npm run 命令中提取 script 名称", () => {
    expect(collectNpmScriptName("npm run verify:gui-smoke -- --reuse-running")).toBe(
      "verify:gui-smoke",
    );
    expect(collectNpmScriptName("node scripts/foo.mjs")).toBe("");
  });

  it("应接受完整的 Agent QC manifest 和 evidence schema", () => {
    const result = validateAgentQcManifest(validManifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("应阻止 qcloop verifier 缺少 worker stdout 占位符", () => {
    const manifest = structuredClone(validManifest);
    manifest.qcloop.verifierPromptTemplate =
      "verifier {{item}} status={{attempt_status}} code={{exit_code}}";

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "{{stdout}}",
    );
  });

  it("应阻止 qcloop worker 缺少 evidence_required / failure_modes / BLOCKED / 结构化证据约束", () => {
    const manifest = structuredClone(validManifest);
    manifest.qcloop.workerPromptTemplate = "worker {{item}}";

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    const messages = result.issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("evidence_required");
    expect(messages).toContain("failure_modes");
    expect(messages).toContain("QCLOOP_WORKER_RESULT=BLOCKED");
    expect(messages).toContain("QCLOOP_EVIDENCE_SUMMARY_JSON");
  });

  it("应阻止 qcloop verifier 缺少 attempt 状态占位符", () => {
    const manifest = structuredClone(validManifest);
    manifest.qcloop.verifierPromptTemplate = "verifier {{item}} stdout={{stdout}}";

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "{{attempt_status}}",
    );
  });

  it("应阻止 qcloop verifier 缺少 issue ledger 或结构化证据审查契约", () => {
    const manifest = structuredClone(validManifest);
    manifest.qcloop.verifierPromptTemplate =
      "verifier {{item}} status={{attempt_status}} code={{exit_code}} stdout={{stdout}}";

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    const messages = result.issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("{{qc_history}}");
    expect(messages).toContain("QCLOOP_EVIDENCE_SUMMARY_JSON");
    expect(messages).toContain('{"pass": true|false');
  });

  it("应阻止引用不存在的 npm script", () => {
    const manifest = structuredClone(validManifest);
    manifest.scenarios[0].commands = ["npm run missing-script"];

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "missing-script",
    );
  });

  it("应阻止 P0 场景缺少 evidenceLayers", () => {
    const manifest = structuredClone(validManifest);
    delete manifest.scenarios[0].evidenceLayers;

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "evidenceLayers",
    );
  });

  it("应阻止未知 evidence layer", () => {
    const manifest = structuredClone(validManifest);
    manifest.scenarios[0].evidenceLayers = ["deterministic-smoke", "unknown-layer"];

    const result = validateAgentQcManifest(manifest, {
      packageScripts: packageJson.scripts,
      evidenceSchema,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "unknown-layer",
    );
  });

  it("应把报告渲染成可读 Markdown", () => {
    const report = createAgentQcReport({
      manifest: validManifest,
      packageJson,
      evidenceSchema,
    });
    const markdown = renderAgentQcMarkdownReport(report);

    expect(markdown).toContain("Lime Agent QC 场景报告");
    expect(markdown).toContain("状态: PASS");
    expect(markdown).toContain("command-bridge-contract");
  });
});
