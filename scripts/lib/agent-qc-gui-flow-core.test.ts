import { describe, expect, it } from "vitest";

import {
  createAgentQcGuiFlowReport,
  renderAgentQcGuiFlowMarkdown,
  validateAgentQcGuiFlowManifest,
} from "./agent-qc-gui-flow-core.mjs";

const scenarioManifest = {
  scenarios: [
    { id: "claw-chat-ready-streaming" },
    { id: "workspace-ready-session-restore" },
  ],
};

const flowManifest = {
  manifestVersion: "v1",
  title: "GUI Flow Manifest",
  flows: [
    {
      id: "gui-claw-chat-ready-streaming",
      scenarioId: "claw-chat-ready-streaming",
      risk: "P0",
      surface: "desktop_gui",
      preflight: ["check bridge"],
      steps: ["open", "send"],
      assertions: ["ready"],
      evidenceRequired: ["trace"],
    },
  ],
};

describe("agent-qc-gui-flow-core", () => {
  it("应接受引用现有 scenario 的 GUI flow manifest", () => {
    const result = validateAgentQcGuiFlowManifest(flowManifest, scenarioManifest);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("应拒绝引用不存在 scenario 的 flow", () => {
    const invalid = structuredClone(flowManifest);
    invalid.flows[0].scenarioId = "missing-scenario";

    const result = validateAgentQcGuiFlowManifest(invalid, scenarioManifest);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "missing-scenario",
    );
  });

  it("应汇总 flow 数、步骤数和证据数", () => {
    const report = createAgentQcGuiFlowReport({ flowManifest, scenarioManifest });

    expect(report.valid).toBe(true);
    expect(report.flowCount).toBe(1);
    expect(report.flows[0].stepCount).toBe(2);
    expect(report.flows[0].evidenceCount).toBe(1);
  });

  it("应渲染 Markdown 报告", () => {
    const report = createAgentQcGuiFlowReport({ flowManifest, scenarioManifest });
    const markdown = renderAgentQcGuiFlowMarkdown(report);

    expect(markdown).toContain("GUI Flow Manifest");
    expect(markdown).toContain("gui-claw-chat-ready-streaming");
  });
});
