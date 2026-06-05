import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readFile(path) {
  return fs.readFileSync(path, "utf8");
}

function sectionBetween(content, startHeading, endHeadingPrefix) {
  const start = content.indexOf(startHeading);
  expect(start, `missing section ${startHeading}`).toBeGreaterThanOrEqual(0);
  const afterStart = content.slice(start);
  const end = afterStart.indexOf(endHeadingPrefix, startHeading.length);
  return end === -1 ? afterStart : afterStart.slice(0, end);
}

function retiredGuiCommandPattern() {
  return new RegExp(["npm run ", "ta", "uri(?::dev)?\\b"].join(""), "i");
}

function retiredCliCommandPattern() {
  return new RegExp(["\\b", "ta", "uri dev\\b"].join(""), "i");
}

function expectNoRetiredGuiStartupReference(content, label) {
  expect(content, label).not.toMatch(retiredGuiCommandPattern());
  expect(content, label).not.toMatch(retiredCliCommandPattern());
  expect(content, label).not.toContain(["headless ", "Ta", "uri"].join(""));
  expect(content, label).not.toContain(["验证 ", "Ta", "uri 壳"].join(""));
}

describe("Electron current testing docs guard", () => {
  it("does not recommend retired dev host as a current GUI startup path", () => {
    const requiredDocs = [
      "internal/testing/skills-e2e-testing.md",
      "internal/tests/lime-agent-qc-rollout-plan.md",
    ];
    const optionalDocs = [
      ".codex/skills/lime-playwright-e2e/references/playwright-e2e.md",
    ];
    const docs = [
      ...requiredDocs,
      ...optionalDocs.filter((path) => fs.existsSync(path)),
    ];

    for (const path of docs) {
      expectNoRetiredGuiStartupReference(readFile(path), path);
    }

    const qcloopOperations = readFile("internal/tests/lime-agent-qc-qcloop-operations.md");
    const currentStartupSection = sectionBetween(
      qcloopOperations,
      "## 3. qcloop server 启动环境",
      "\n## ",
    );

    expectNoRetiredGuiStartupReference(
      currentStartupSection,
      "internal/tests/lime-agent-qc-qcloop-operations.md#qcloop-server-startup",
    );
  });

  it("keeps GUI smoke fixtures on Electron current commands", () => {
    const agentQcReportTest = readFile("scripts/lib/agent-qc-report-core.test.ts");
    expect(agentQcReportTest).toContain(
      '"verify:gui-smoke": "npm run smoke:electron"',
    );
    expect(agentQcReportTest).toContain(
      '"smoke:electron": "node scripts/electron-smoke.mjs"',
    );
    expect(agentQcReportTest).not.toMatch(
      /"verify:gui-smoke"\s*:\s*"node scripts\/verify-gui-smoke\.mjs"/,
    );

    const runLockTest = readFile("scripts/lib/gui-smoke-run-lock.test.mjs");
    expect(runLockTest).toContain('command: "npm run smoke:electron"');
    expect(runLockTest).not.toContain(
      'command: "node scripts/verify-gui-smoke.mjs"',
    );
  });

  it("keeps internal testing entrypoints on Electron and App Server current", () => {
    const testingIndex = readFile("internal/test/README.md");
    expect(testingIndex).toContain(
      "Electron Desktop Host + App Server JSON-RPC",
    );
    expect(testingIndex).toContain("packages/app-server-client");
    expect(testingIndex).toContain("src/lib/desktop-host/");
    expect(testingIndex).toContain("smoke:electron");
    expect(testingIndex).toContain("verify:gui-smoke");
    expect(testingIndex).toContain("测试用例需要全面更新事实源");
    expect(testingIndex).toContain("不得作为新功能可交付证据");

    const p0Scenarios = readFile("internal/tests/agent-qc-p0-scenarios.md");
    expect(p0Scenarios).toContain("npm run test:contracts");
    expect(p0Scenarios).toContain("npm run verify:gui-smoke");
    expect(p0Scenarios).toContain("release / GUI startup smoke");
    expectNoRetiredGuiStartupReference(
      p0Scenarios,
      "internal/tests/agent-qc-p0-scenarios.md",
    );

    const autonomousMatrix = readFile(
      "internal/tests/lime-agent-autonomous-test-execution-matrix.md",
    );
    expect(autonomousMatrix).toContain("Electron dev host");
    expect(autonomousMatrix).toContain("npm run test:contracts");
    expect(autonomousMatrix).toContain("npm run verify:gui-smoke");
    expect(autonomousMatrix).toContain("passive desktop runtime");
  });

  it("keeps E2E and testing strategy current sections on Electron evidence", () => {
    const e2eGuide = readFile("internal/test/e2e-tests.md");
    const e2eCurrentSection = sectionBetween(
      e2eGuide,
      "### current",
      "\n### supplement",
    );

    expect(e2eCurrentSection).toContain("npm run electron:dev");
    expect(e2eCurrentSection).toContain("npm run smoke:electron");
    expect(e2eCurrentSection).toContain("Electron GUI");
    expectNoRetiredGuiStartupReference(
      e2eCurrentSection,
      "internal/test/e2e-tests.md#current",
    );

    const testingStrategy = readFile("internal/test/testing-strategy-2026.md");
    const strategyCurrentSection = sectionBetween(
      testingStrategy,
      "### current",
      "\n### compat",
    );

    expect(strategyCurrentSection).toContain("Electron Desktop Host");
    expect(strategyCurrentSection).toContain("App Server JSON-RPC");
    expect(strategyCurrentSection).toContain("packages/app-server-client");
    expect(strategyCurrentSection).toContain("src/lib/desktop-host/");
    expect(strategyCurrentSection).toContain("npm run smoke:electron");
    expect(strategyCurrentSection).toContain("npm run verify:gui-smoke");
    expectNoRetiredGuiStartupReference(
      strategyCurrentSection,
      "internal/test/testing-strategy-2026.md#current",
    );
  });
});
