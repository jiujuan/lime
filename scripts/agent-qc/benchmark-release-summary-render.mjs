function renderMarkdown(summary) {
  const lines = [
    "# Benchmark Release Summary",
    "",
    `- datasetVersion: ${summary.datasetVersion || "-"}`,
    `- releaseReady: ${summary.releaseReady ? "yes" : "no"}`,
    `- evidenceRoot: ${summary.evidenceRoot}`,
    `- evidenceFiles: ${summary.summary.evidenceFileCount}`,
    `- p0Gate: ${summary.summary.p0GatePassedCount || 0} passed / ${summary.summary.p0GateFailedCount || 0} failed / ${summary.summary.p0GateSkippedCount || 0} skipped`,
    `- releaseBlockers: ${summary.summary.releaseBlockerCount}`,
    `- p0GateBlockers: ${summary.summary.p0GateBlockerCount || 0}`,
    `- preflightBlockers: ${summary.summary.preflightBlockerCount}`,
    `- trueRunBlockers: ${summary.summary.trueRunBlockerCount || 0}`,
    `- trueRunEvidenceBlockers: ${summary.summary.trueRunEvidenceBlockerCount || 0}`,
    "",
    "## Suites",
    "",
    "| Suite | Priority | Runner | State | P0 Gate | Dry Run | Preflight | True Run | Release Blocking |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const suite of summary.suites) {
    const dryRun = suite.dryRun
      ? `${suite.dryRun.verdict} ${suite.dryRun.readyCount}/${suite.dryRun.taskCount}`
      : "-";
    const p0Gate =
      suite.p0Gate.length === 0
        ? "-"
        : suite.p0Gate
            .map((entry) => `${entry.command}:${entry.status || "unknown"}`)
            .join("<br>");
    const preflight =
      suite.preflights.length === 0
        ? "-"
        : suite.preflights
            .map((entry) => `${entry.taskId}:${entry.verdict}`)
            .join("<br>");
    const trueRun = suite.trueRun
      ? `${suite.trueRun.verdict} ${suite.trueRun.readyCount}/${suite.trueRun.taskCount}`
      : suite.trueRunTasks.length === 0
        ? "-"
        : suite.trueRunTasks
            .map((entry) => `${entry.taskId}:${entry.verdict}`)
            .join("<br>");
    lines.push(
      `| ${suite.id} | ${suite.priority} | ${suite.runner} | ${suite.state} | ${p0Gate} | ${dryRun} | ${preflight} | ${trueRun} | ${suite.releaseBlocking ? "yes" : "no"} |`,
    );
  }

  lines.push("", "## Release Blockers", "");
  if (summary.releaseBlockers.length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of summary.releaseBlockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("", "## P0 Gate Blockers", "");
  if ((summary.p0GateBlockers || []).length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of summary.p0GateBlockers) {
      lines.push(
        `- ${blocker.suiteId}: ${blocker.id}${blocker.command ? ` ${blocker.command}` : ""} (${blocker.reason})`,
      );
    }
  }

  lines.push("", "## Preflight Blockers", "");
  if (summary.preflightBlockers.length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of summary.preflightBlockers) {
      lines.push(
        `- ${blocker.suiteId}/${blocker.taskId}: ${blocker.id} (${blocker.reason})`,
      );
    }
  }

  lines.push("", "## True Run Blockers", "");
  if ((summary.trueRunBlockers || []).length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of summary.trueRunBlockers) {
      lines.push(
        `- ${blocker.suiteId}${blocker.taskId ? `/${blocker.taskId}` : ""}: ${blocker.id} (${blocker.reason})`,
      );
    }
  }

  lines.push("", "## True Run Evidence Blockers", "");
  if ((summary.trueRunEvidenceBlockers || []).length === 0) {
    lines.push("- 无");
  } else {
    for (const blocker of summary.trueRunEvidenceBlockers) {
      lines.push(
        `- ${blocker.suiteId}${blocker.taskId ? `/${blocker.taskId}` : ""}: ${blocker.id} (${blocker.reason})`,
      );
    }
  }

  if (summary.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of summary.issues) {
      lines.push(`- ${issue}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export { renderMarkdown };
