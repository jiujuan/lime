function normalizeStatus(exitCode, signal) {
  return exitCode === 0 && !signal ? "pass" : "fail";
}

function buildAgentQcLocalVerifyGateReport({
  command = "npm run verify:local",
  cwd = "",
  exitCode = null,
  signal = null,
  startedAt = new Date().toISOString(),
  completedAt = new Date().toISOString(),
  durationMs = 0,
} = {}) {
  const status = normalizeStatus(exitCode, signal);
  return {
    schemaVersion: "v1",
    generatedAt: completedAt,
    command,
    cwd,
    status,
    exitCode,
    signal,
    startedAt,
    completedAt,
    durationMs,
    failedStage:
      status === "pass"
        ? ""
        : signal
          ? `signal=${signal}`
          : `exitCode=${exitCode ?? "unknown"}`,
    guardrails: {
      officialEvidenceOverwritten: false,
      qcloopDbModified: false,
      gitMutation: false,
    },
  };
}

function renderAgentQcLocalVerifyGateMarkdown(report) {
  const lines = [
    "# Agent QC Local Verify Gate",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Command: \`${report.command}\``,
    `- Exit code: ${report.exitCode ?? "none"}`,
    `- Signal: ${report.signal || "none"}`,
    `- Duration ms: ${report.durationMs}`,
    `- Failed stage: ${report.failedStage || "none"}`,
    "",
    "## Guardrails",
    "",
  ];
  for (const [key, value] of Object.entries(report.guardrails || {})) {
    lines.push(`- ${key}: ${String(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

export {
  buildAgentQcLocalVerifyGateReport,
  renderAgentQcLocalVerifyGateMarkdown,
};
