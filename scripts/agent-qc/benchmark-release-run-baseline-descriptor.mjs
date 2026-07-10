import fs from "node:fs";
import path from "node:path";

function normalizePath(filePath) {
  return String(filePath || "").replaceAll("\\", "/");
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function baselineSummaryPathForVersion(version) {
  return normalizePath(
    `.lime/benchmark/releases/${version}/benchmark-release-summary.json`,
  );
}

function baselineDescriptorPathForSummary(summaryPath) {
  return normalizePath(
    path.join(path.dirname(summaryPath), "benchmark-baseline.json"),
  );
}

function resolveBaselineSummaryPath({
  baselineSummaryPath = "",
  baselineVersion = "",
} = {}) {
  if (baselineSummaryPath && baselineVersion) {
    throw new Error("baselineSummaryPath 和 baselineVersion 只能二选一");
  }
  if (baselineSummaryPath) {
    return normalizePath(baselineSummaryPath);
  }
  if (baselineVersion) {
    return baselineSummaryPathForVersion(baselineVersion);
  }
  return "";
}

function validateBaselineDescriptorForStrictGate({
  rootDir,
  strictGate,
  baselineSummaryPath = "",
} = {}) {
  if (!strictGate) {
    return {
      status: "not_required",
      descriptorPath: "",
      issues: [],
      payload: null,
    };
  }
  const descriptorPath = baselineDescriptorPathForSummary(baselineSummaryPath);
  const resolvedDescriptorPath = path.resolve(rootDir, descriptorPath);
  const issues = [];
  let payload = null;
  if (!fs.existsSync(resolvedDescriptorPath)) {
    issues.push(`${descriptorPath}: baseline descriptor 不存在`);
  } else {
    try {
      payload = readJsonFile(resolvedDescriptorPath);
    } catch (error) {
      issues.push(
        `${descriptorPath}: baseline descriptor 读取失败：${error.message}`,
      );
    }
  }
  if (payload) {
    if (payload.schemaVersion !== "benchmark-release-baseline-v1") {
      issues.push(
        `${descriptorPath}: schemaVersion 不是 benchmark-release-baseline-v1`,
      );
    }
    if (payload.baselineReady !== true) {
      issues.push(`${descriptorPath}: baselineReady 不是 true`);
    }
    if (payload.releaseReady !== true) {
      issues.push(`${descriptorPath}: releaseReady 不是 true`);
    }
    if (
      payload.allowNotReady === true ||
      payload.baselineKind === "bootstrap"
    ) {
      issues.push(`${descriptorPath}: bootstrap baseline 不能用于 strict gate`);
    }
    const descriptorSummaryPath = payload.summaryPath
      ? normalizePath(payload.summaryPath)
      : "";
    if (
      descriptorSummaryPath &&
      descriptorSummaryPath !== normalizePath(baselineSummaryPath)
    ) {
      issues.push(
        `${descriptorPath}: summaryPath=${descriptorSummaryPath} 与 baselineSummaryPath=${normalizePath(baselineSummaryPath)} 不一致`,
      );
    }
  }
  return {
    status: issues.length === 0 ? "ready" : "blocked",
    descriptorPath,
    issues,
    payload,
  };
}

export {
  baselineDescriptorPathForSummary,
  baselineSummaryPathForVersion,
  resolveBaselineSummaryPath,
  validateBaselineDescriptorForStrictGate,
};
