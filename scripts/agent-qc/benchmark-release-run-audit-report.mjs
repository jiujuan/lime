import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildBenchmarkReleaseReport,
  renderMarkdown as renderAuditReportMarkdown,
  validateBenchmarkReleaseReport,
} from "./benchmark-release-report.mjs";

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeReleaseAuditReportFile({
  rootDir = process.cwd(),
  releaseRoot: targetReleaseRoot = "",
  outputPath = "",
} = {}) {
  const auditReport = buildBenchmarkReleaseReport({
    rootDir,
    releaseRoot: targetReleaseRoot,
  });
  const validation = validateBenchmarkReleaseReport(auditReport);
  const resolvedReleaseRoot = targetReleaseRoot || auditReport.releaseRoot;
  const targetPath = normalizePath(
    outputPath || path.join(resolvedReleaseRoot, "benchmark-release-report.md"),
  );
  writeTextFile(path.resolve(rootDir, targetPath), renderAuditReportMarkdown(auditReport));
  return {
    path: targetPath,
    report: auditReport,
    validation,
  };
}

export { writeReleaseAuditReportFile };
