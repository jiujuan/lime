function renderMarkdown(report) {
  const lines = [
    "# Benchmark Release Run",
    "",
    `- version: ${report.plan.version}`,
    `- outputRoot: ${report.plan.outputRoot}`,
    `- valid: ${report.summary.valid ? "yes" : "no"}`,
    `- steps: ${report.summary.passedStepCount} passed / ${report.summary.failedStepCount} failed / ${report.summary.skippedStepCount} skipped`,
    "",
    "## Steps",
    "",
    "| Step | Kind | Status | Exit | Output |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const step of report.steps) {
    lines.push(
      `| ${step.id} | ${step.kind} | ${step.status} | ${step.exitCode ?? "-"} | ${step.outputPath || "-"} |`,
    );
  }

  if (report.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of report.issues) {
      lines.push(`- ${issue}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderConsoleSummary(report, { outputPath = "", outputWriteError = "" } = {}) {
  const failedSteps = report.steps.filter((step) => step.status === "failed");
  const skippedSteps = report.steps.filter((step) => step.status === "skipped");
  const lines = [
    "Benchmark Release Run Summary",
    `version=${report.plan.version}`,
    `outputRoot=${report.plan.outputRoot}`,
    `report=${outputPath || "-"}`,
    `valid=${report.summary.valid ? "true" : "false"}`,
    `steps=${report.summary.passedStepCount} passed / ${report.summary.failedStepCount} failed / ${report.summary.skippedStepCount} skipped`,
    `storage=${report.storage?.status || "unknown"}${report.storage?.reason ? `:${report.storage.reason}` : ""}`,
    `fullExternalSuites=${report.plan.fullExternalSuites ? "true" : "false"}`,
    `includeP0=${report.plan.includeP0 ? "true" : "false"}`,
    `strictGate=${report.plan.strictGate ? "true" : "false"}`,
  ];

  if (outputWriteError) {
    lines.push(`writeError=${outputWriteError}`);
  }
  if (report.baselineDescriptor?.status && report.baselineDescriptor.status !== "not_required") {
    lines.push(`baselineDescriptor=${report.baselineDescriptor.status}`);
  }
  for (const step of [...failedSteps, ...skippedSteps].slice(0, 10)) {
    lines.push(`- ${step.status}: ${step.id}${step.reason ? ` (${step.reason})` : ""}`);
  }
  if (failedSteps.length + skippedSteps.length > 10) {
    lines.push(`- ... ${failedSteps.length + skippedSteps.length - 10} more non-passed steps`);
  }
  for (const issue of (report.issues || []).slice(0, 10)) {
    lines.push(`issue=${issue}`);
  }

  return `${lines.join("\n")}\n`;
}

export { renderConsoleSummary, renderMarkdown };
