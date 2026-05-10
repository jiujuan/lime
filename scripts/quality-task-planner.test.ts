import { describe, expect, it } from "vitest";

import { detectTasks } from "./quality-task-planner.mjs";

describe("quality-task-planner", () => {
  it("Agent QC 文档不应进入 GitHub Actions bridge/contracts 验证", () => {
    const tasks = detectTasks([
      "docs/tests/agent-ops-qc.md",
      "docs/tests/agent-qc-p0-scenarios.md",
      "docs/tests/lime-agent-qc-rollout-plan.md",
      "docs/test/agent-qc-scenarios.manifest.json",
      "docs/test/agent-qc-evidence.schema.json",
      "docs/test/agent-qc-gui-flows.manifest.json",
    ]);

    expect(tasks.bridge).toBe(false);
    expect(tasks.bridgeReasons).not.toContain("agent_qc_contract");
    expect(tasks.docsOnly).toBe(true);
  });

  it("Agent QC 本地脚本不应触发 bridge/contracts 原因", () => {
    const tasks = detectTasks([
      "scripts/lib/agent-qc-completion-audit-core.mjs",
      "scripts/lib/agent-qc-evidence-core.mjs",
      "scripts/lib/agent-qc-gui-flow-core.mjs",
      "scripts/lib/agent-qc-qcloop-job-core.mjs",
      "scripts/lib/agent-qc-release-summary-core.mjs",
    ]);

    expect(tasks.bridge).toBe(false);
    expect(tasks.bridgeReasons).not.toContain("agent_qc_contract");
    expect(tasks.docsOnly).toBe(false);
  });

  it("应把 harness cleanup/report 主链文件归到 bridge/contracts 风险", () => {
    const tasks = detectTasks([
      "scripts/lib/generated-slop-report-core.mjs",
      "scripts/check-generated-slop-report.mjs",
      "scripts/harness-eval-history-record.mjs",
    ]);

    expect(tasks.bridge).toBe(true);
    expect(tasks.bridgeReasons).toContain("harness_cleanup_contract");
    expect(tasks.docsOnly).toBe(false);
  });

  it("应把 harness dashboard 渲染文件归到 bridge/contracts 风险", () => {
    const tasks = detectTasks(["scripts/lib/harness-dashboard-core.mjs"]);

    expect(tasks.bridge).toBe(true);
    expect(tasks.bridgeReasons).toContain("harness_cleanup_contract");
    expect(tasks.docsOnly).toBe(false);
  });

  it("应把 DevBridge 主链改动标记为 bridge runtime 风险", () => {
    const tasks = detectTasks(["src/lib/dev-bridge/safeInvoke.ts"]);

    expect(tasks.bridge).toBe(true);
    expect(tasks.bridgeReasons).toContain("bridge_runtime");
    expect(tasks.docsOnly).toBe(false);
  });

  it("临时 Windows 测试包 workflow 单独变更不应触发质量全量", () => {
    const tasks = detectTasks([".github/workflows/build-windows-test.yml"]);

    expect(tasks.workflow).toBe(false);
    expect(tasks.integrity).toBe(false);
    expect(tasks.frontend).toBe(false);
    expect(tasks.bridge).toBe(false);
    expect(tasks.guiSmoke).toBe(false);
  });

  it("临时测试包 workflow 搭配前端改动时不应升级成 workflow 全量", () => {
    const tasks = detectTasks([
      ".github/workflows/build-windows-test.yml",
      "src/components/api-key-provider/ApiKeyProviderSection.tsx",
    ]);

    expect(tasks.workflow).toBe(false);
    expect(tasks.frontend).toBe(true);
    expect(tasks.guiSmoke).toBe(true);
    expect(tasks.bridge).toBe(false);
    expect(tasks.bridgeReasons).not.toContain("workflow_full_suite");
  });

  it("正式工作流变更仍应触发 workflow 全量质量门禁", () => {
    const tasks = detectTasks([".github/workflows/release.yml"]);

    expect(tasks.workflow).toBe(true);
    expect(tasks.integrity).toBe(true);
    expect(tasks.frontend).toBe(true);
    expect(tasks.bridge).toBe(true);
    expect(tasks.guiSmoke).toBe(true);
    expect(tasks.bridgeReasons).toContain("workflow_full_suite");
  });

  it("正式工作流搭配项目资料主路径改动时仍应推荐产品 E2E", () => {
    const tasks = detectTasks([
      ".github/workflows/release.yml",
      "src/features/knowledge/KnowledgePage.tsx",
    ]);

    expect(tasks.workflow).toBe(true);
    expect(tasks.recommendedCommands).toEqual([
      "npm run knowledge:product-e2e",
      "npm run verify:gui-smoke -- --include-knowledge-product-e2e --reuse-running",
    ]);
  });

  it("项目资料主路径改动应推荐产品 E2E 重验命令", () => {
    const tasks = detectTasks([
      "src/features/knowledge/KnowledgePage.tsx",
      "scripts/knowledge-product-e2e.mjs",
    ]);

    expect(tasks.guiSmoke).toBe(true);
    expect(tasks.recommendedCommands).toEqual([
      "npm run knowledge:product-e2e",
      "npm run verify:gui-smoke -- --include-knowledge-product-e2e --reuse-running",
    ]);
  });

  it("文档-only 项目资料改动不应强推产品 E2E", () => {
    const tasks = detectTasks(["docs/roadmap/knowledge/prd-v3.md"]);

    expect(tasks.docsOnly).toBe(true);
    expect(tasks.recommendedCommands).toEqual([]);
  });
});
