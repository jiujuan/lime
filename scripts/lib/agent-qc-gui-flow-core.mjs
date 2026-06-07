const REQUIRED_FLOW_FIELDS = [
  "id",
  "scenarioId",
  "risk",
  "surface",
  "preflight",
  "steps",
  "assertions",
  "evidenceRequired",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addIssue(issues, severity, path, message) {
  issues.push({ severity, path, message });
}

function validateStringArray(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, "error", path, "必须是非空数组。");
    return;
  }
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      addIssue(issues, "error", `${path}[${index}]`, "必须是非空字符串。");
    }
  });
}

function validateAgentQcGuiFlowManifest(flowManifest, scenarioManifest) {
  const issues = [];
  if (!flowManifest || typeof flowManifest !== "object") {
    return {
      valid: false,
      issues: [
        {
          severity: "error",
          path: "manifest",
          message: "GUI flow manifest 必须是 JSON object。",
        },
      ],
    };
  }

  if (flowManifest.manifestVersion !== "v1") {
    addIssue(
      issues,
      "error",
      "manifestVersion",
      "当前只接受 manifestVersion=v1。",
    );
  }

  const scenarios = new Set(
    asArray(scenarioManifest?.scenarios)
      .map((scenario) => scenario.id)
      .filter(Boolean),
  );
  const flows = asArray(flowManifest.flows);
  const flowIds = new Set();

  if (flows.length === 0) {
    addIssue(issues, "error", "flows", "至少需要一个 GUI flow。");
  }

  flows.forEach((flow, index) => {
    const prefix = `flows[${index}]`;
    for (const field of REQUIRED_FLOW_FIELDS) {
      if (!(field in flow)) {
        addIssue(issues, "error", `${prefix}.${field}`, `缺少 ${field}。`);
      }
    }

    if (!isNonEmptyString(flow.id)) {
      addIssue(issues, "error", `${prefix}.id`, "flow id 必须是非空字符串。");
    } else if (flowIds.has(flow.id)) {
      addIssue(issues, "error", `${prefix}.id`, `重复 flow id: ${flow.id}`);
    } else {
      flowIds.add(flow.id);
    }

    if (!isNonEmptyString(flow.scenarioId)) {
      addIssue(
        issues,
        "error",
        `${prefix}.scenarioId`,
        "scenarioId 必须是非空字符串。",
      );
    } else if (!scenarios.has(flow.scenarioId)) {
      addIssue(
        issues,
        "error",
        `${prefix}.scenarioId`,
        `引用了不存在的 Agent QC scenario: ${flow.scenarioId}`,
      );
    }

    for (const field of [
      "preflight",
      "steps",
      "assertions",
      "evidenceRequired",
    ]) {
      validateStringArray(flow[field], `${prefix}.${field}`, issues);
    }
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  return {
    valid: errors.length === 0,
    issues,
  };
}

function summarizeAgentQcGuiFlowManifest(flowManifest, validation) {
  const flows = asArray(flowManifest?.flows);
  const riskCounts = new Map();
  for (const flow of flows) {
    const risk = flow.risk || "unknown";
    riskCounts.set(risk, (riskCounts.get(risk) ?? 0) + 1);
  }

  return {
    title: flowManifest?.title || "Lime Agent QC GUI Flow Manifest",
    manifestVersion: flowManifest?.manifestVersion || "unknown",
    valid: validation.valid,
    issueCount: validation.issues.length,
    errorCount: validation.issues.filter((issue) => issue.severity === "error")
      .length,
    warnCount: validation.issues.filter((issue) => issue.severity === "warn")
      .length,
    flowCount: flows.length,
    risks: Object.fromEntries(
      Array.from(riskCounts.entries()).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    flows: flows.map((flow) => ({
      id: flow.id,
      scenarioId: flow.scenarioId,
      risk: flow.risk,
      surface: flow.surface,
      stepCount: asArray(flow.steps).length,
      assertionCount: asArray(flow.assertions).length,
      evidenceCount: asArray(flow.evidenceRequired).length,
    })),
    issues: validation.issues,
  };
}

function renderAgentQcGuiFlowMarkdown(summary) {
  const flowLines = summary.flows.length
    ? summary.flows
        .map(
          (flow) =>
            `- ${flow.id}: ${flow.scenarioId}；${flow.risk}；${flow.surface}；steps ${flow.stepCount} / assertions ${flow.assertionCount} / evidence ${flow.evidenceCount}`,
        )
        .join("\n")
    : "- 无";
  const issueLines = summary.issues.length
    ? summary.issues
        .map(
          (issue) =>
            `- ${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`,
        )
        .join("\n")
    : "- 无";

  return `# ${summary.title}

## 结论

- Manifest: ${summary.manifestVersion}
- 状态: ${summary.valid ? "PASS" : "FAIL"}
- Flow 数: ${summary.flowCount}
- Issue: ${summary.issueCount}（error ${summary.errorCount} / warn ${summary.warnCount}）

## Flow 清单

${flowLines}

## 校验问题

${issueLines}
`;
}

function createAgentQcGuiFlowReport({ flowManifest, scenarioManifest }) {
  const validation = validateAgentQcGuiFlowManifest(
    flowManifest,
    scenarioManifest,
  );
  return summarizeAgentQcGuiFlowManifest(flowManifest, validation);
}

export {
  createAgentQcGuiFlowReport,
  renderAgentQcGuiFlowMarkdown,
  summarizeAgentQcGuiFlowManifest,
  validateAgentQcGuiFlowManifest,
};
