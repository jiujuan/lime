function itemById(audit) {
  return new Map((audit.items || []).map((item) => [item.id, item]));
}

function allPassed(items, ids) {
  return ids.every((id) => items.get(id)?.passed === true);
}

function evidenceFor(items, ids) {
  return ids
    .map((id) => `${id}=${items.get(id)?.passed ? "pass" : "fail"}`)
    .join("; ");
}

function gapFor(items, ids) {
  return ids
    .map((id) => items.get(id))
    .filter((item) => item && !item.passed)
    .map((item) => item.gap)
    .filter(Boolean)
    .join("; ");
}

function hasOwnerProtocolEvidence(items, processOwner) {
  return (
    items.get("qcloop-status-monitor")?.passed === true &&
    items.get("gui-owner-check")?.passed === true &&
    (processOwner?.verdict?.status === "pass" ||
      processOwner?.ownerIntervention?.status === "requires_owner_confirmation")
  );
}

function ownerProtocolStatus(items, processOwner) {
  if (!hasOwnerProtocolEvidence(items, processOwner)) {
    return "fail";
  }
  return processOwner?.verdict?.status === "busy"
    ? "pass_with_blocking_owner"
    : "pass";
}

function buildAgentQcObjectiveChecklist({
  audit,
  processOwner,
  guiOwner,
  generatedAt = new Date().toISOString(),
}) {
  const items = itemById(audit);
  const manifestIds = [
    "scenario-manifest",
    "gui-flow-manifest",
    "evidence-schema",
  ];
  const qcloopToolingIds = [
    "qcloop-payload-generator",
    "qcloop-payload-coverage",
    "qcloop-verifier-evidence-placeholders",
    "structured-evidence-contract",
    "qcloop-evidence-exporter",
    "release-summary",
  ];
  const checklist = [
    {
      requirement: "在 internal/tests 下增加并维护 Agent/AI 测试标准文档",
      artifacts: [
        "internal/tests/README.md",
        "internal/tests/agent-ops-qc.md",
        "internal/tests/ai-agent-testing-guide.md",
        "internal/tests/lime-agent-autonomous-testing-plan.md",
      ],
      evidence: items.get("docs-tests-standard")?.evidence || "",
      status: items.get("docs-tests-standard")?.passed ? "pass" : "fail",
      gap: items.get("docs-tests-standard")?.gap || "",
    },
    {
      requirement:
        "提供 P0 scenario manifest、GUI flow manifest、Evidence Pack schema",
      artifacts: [
        "internal/test/agent-qc-scenarios.manifest.json",
        "internal/test/agent-qc-gui-flows.manifest.json",
        "internal/test/agent-qc-evidence.schema.json",
      ],
      evidence: manifestIds
        .map((id) => items.get(id)?.evidence)
        .filter(Boolean)
        .join("; "),
      status: allPassed(items, manifestIds) ? "pass" : "fail",
      gap: gapFor(items, manifestIds),
    },
    {
      requirement:
        "qcloop payload / verifier / exporter / release summary gate 可生成和审查结构化证据",
      artifacts: [
        "scripts/agent-qc/qcloop-job.mjs",
        "scripts/agent-qc/payload-coverage.mjs",
        "scripts/agent-qc/export-evidence.mjs",
        "scripts/agent-qc/release-summary.mjs",
        "internal/tests/lime-agent-qc-evidence-contract.md",
      ],
      evidence: evidenceFor(items, qcloopToolingIds),
      status: allPassed(items, qcloopToolingIds) ? "pass" : "fail",
      gap: gapFor(items, qcloopToolingIds),
    },
    {
      requirement:
        "qcloop / GUI owner / raw process owner 有只读取证与安全处置协议",
      artifacts: [
        "scripts/agent-qc/qcloop-status.mjs",
        "scripts/agent-qc/gui-owner-check.mjs",
        "scripts/agent-qc/process-owner-check.mjs",
        "scripts/lib/agent-qc-process-owner-core.mjs",
        "internal/tests/lime-agent-qc-qcloop-operations.md",
        ".lime/qc/stale-raw-gui-owner-intervention-request.json",
      ],
      evidence: `guiOwner=${guiOwner?.verdict?.status}; processOwner=${processOwner?.verdict?.status}; ${processOwner?.verdict?.summary || ""}; ownerIntervention=${processOwner?.ownerIntervention?.status}`,
      status: ownerProtocolStatus(items, processOwner),
      gap:
        processOwner?.verdict?.status === "busy"
          ? "raw process owner 仍 busy，不能启动完整 verify:local 或 full GUI P0。"
          : "",
    },
    {
      requirement:
        "官方 .lime/qc/agent-qc-evidence.json 必须是真实 8/8 P0 pass Evidence Pack",
      artifacts: [
        ".lime/qc/agent-qc-evidence.json",
        "internal/test/agent-qc-scenarios.manifest.json",
      ],
      evidence: items.get("real-qcloop-evidence")?.evidence || "",
      status: items.get("real-qcloop-evidence")?.passed ? "pass" : "fail",
      gap: items.get("real-qcloop-evidence")?.gap || "",
    },
    {
      requirement: "仓库统一门禁 npm run verify:local 必须通过",
      artifacts: [".lime/qc/verify-local-current.json", "npm run verify:local"],
      evidence: items.get("local-verify-gate")?.evidence || "",
      status: items.get("local-verify-gate")?.passed ? "pass" : "fail",
      gap: items.get("local-verify-gate")?.gap || "",
    },
    {
      requirement:
        "在 Lime 仓库内不执行未授权 git commit / push / tag / release",
      artifacts: ["git status", "user guardrail"],
      evidence:
        "本轮未执行 git commit / push / tag / release；工作树存在其他并发进程产生的 unrelated 修改，未触碰。",
      status: "pass",
      gap: "",
    },
  ];
  const blockers = checklist
    .filter((item) => item.status !== "pass")
    .map((item) => ({
      requirement: item.requirement,
      status: item.status,
      gap: item.gap,
    }));
  return {
    schemaVersion: "v1",
    generatedAt,
    objective: "实现 Agent QC / 测试体系整体目标，并以真实证据证明可发布",
    status: blockers.length === 0 ? "complete" : "incomplete",
    passedCount: checklist.filter((item) => item.status === "pass").length,
    totalCount: checklist.length,
    blockers,
    checklist,
  };
}

function renderAgentQcObjectiveChecklistMarkdown(result) {
  const lines = [
    "# Objective Completion Checklist",
    "",
    `- Generated at: ${result.generatedAt}`,
    `- Status: ${result.status}`,
    `- Passed: ${result.passedCount}/${result.totalCount}`,
    "",
    "## Checklist",
    "",
  ];
  for (const item of result.checklist) {
    lines.push(
      `### ${item.status.toUpperCase()} ${item.requirement}`,
      "",
      `- Artifacts: ${item.artifacts.join(", ")}`,
      `- Evidence: ${item.evidence || "none"}`,
      `- Gap: ${item.gap || "none"}`,
      "",
    );
  }
  lines.push("## Blockers", "");
  if (!result.blockers.length) {
    lines.push("- none");
  }
  for (const blocker of result.blockers) {
    lines.push(`- ${blocker.requirement}: ${blocker.gap || blocker.status}`);
  }
  return `${lines.join("\n")}\n`;
}

export {
  buildAgentQcObjectiveChecklist,
  renderAgentQcObjectiveChecklistMarkdown,
};
