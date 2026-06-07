function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePathText(value) {
  return isNonEmptyString(value) ? value.trim().replace(/\\/g, "/") : "";
}

function createCheck(id, title, passed, detail = "") {
  return {
    id,
    title,
    passed: Boolean(passed),
    detail,
  };
}

function buildQCLoopPreflightReport({
  cwd,
  expectedCwd = "",
  tmpWritable = false,
  devBridge = null,
} = {}) {
  const checks = [];
  const normalizedCwd = normalizePathText(cwd);
  const normalizedExpectedCwd = normalizePathText(expectedCwd);

  checks.push(
    createCheck(
      "cwd-present",
      "当前工作目录可读",
      Boolean(normalizedCwd),
      normalizedCwd,
    ),
  );
  if (normalizedExpectedCwd) {
    checks.push(
      createCheck(
        "cwd-expected",
        "当前工作目录匹配预期仓库",
        normalizedCwd === normalizedExpectedCwd,
        `cwd=${normalizedCwd || "unknown"} expected=${normalizedExpectedCwd}`,
      ),
    );
  }
  checks.push(
    createCheck(
      "tmp-writable",
      "临时目录可写",
      tmpWritable === true,
      tmpWritable ? "tmp write ok" : "tmp write failed",
    ),
  );

  if (devBridge) {
    checks.push(
      createCheck(
        "devbridge-health",
        "DevBridge health 可访问",
        devBridge.ok === true,
        devBridge.ok
          ? `status=${devBridge.status || "ok"}`
          : `url=${devBridge.url || "unknown"} error=${devBridge.error || "unknown"}`,
      ),
    );
  }

  const failed = checks.filter((check) => !check.passed);
  return {
    schemaVersion: "v1",
    status: failed.length === 0 ? "pass" : "blocked",
    checks,
    failedChecks: failed.map((check) => check.id),
    summary:
      failed.length === 0
        ? "qcloop worker preflight 通过。"
        : `qcloop worker preflight 阻断：${failed.map((check) => check.id).join(", ")}。`,
  };
}

export { buildQCLoopPreflightReport, createCheck };
