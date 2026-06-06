import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function expectNoBrandPrefixRule(content, label) {
  expect(content, label).toMatch(/Lime`\s*\/\s*`lime_`\s*\/\s*`lime-/);
  expect(content, label).toMatch(/品牌前缀|新增命名/);
  expect(content, label).toMatch(
    /不得添加|不要加|使用领域名|current 事实源命名|直接使用领域名/,
  );
}

function expectAppServerAgentRule(content, label) {
  expect(content, label).toMatch(/App Server JSON-RPC|JSON-RPC/);
  expect(content, label).toMatch(/新增 AI Agent|新增 Agent 逻辑|新增的是 AI Agent/);
  expect(content, label).toMatch(/agent_runtime_\*/);
  expect(content, label).toMatch(/兼容适配|compat/);
}

function retiredHostPackageName() {
  return ["@", "ta", "uri-apps"].join("");
}

function retiredHostGlobalName() {
  return ["__TA", "URI__"].join("");
}

function retiredHostInternalsName() {
  return ["__TA", "URI_INTERNALS__"].join("");
}

function retiredHostMockDir() {
  return ["src/lib/", "ta", "uri-mock"].join("");
}

function retiredHostPackagePatternSource() {
  return '["@", "ta", "uri-apps", "\\\\/api"].join("")';
}

function retiredHostGlobalPatternSource() {
  return '["__TA", "URI__"].join("")';
}

describe("Electron current repository rules guard", () => {
  it("keeps root and aiprompts rules on Electron/App Server current", () => {
    const docs = [
      "AGENTS.md",
      "internal/aiprompts/README.md",
      "internal/aiprompts/commands.md",
      "internal/aiprompts/governance.md",
      "internal/aiprompts/quality-workflow.md",
    ];

    for (const filePath of docs) {
      const content = readFile(filePath);

      expect(content, filePath).toMatch(/Electron/);
      expect(content, filePath).toMatch(/App Server/);
    }

    expectNoBrandPrefixRule(readFile("AGENTS.md"), "AGENTS.md");
    expectAppServerAgentRule(readFile("AGENTS.md"), "AGENTS.md");
    expectNoBrandPrefixRule(
      readFile("internal/aiprompts/README.md"),
      "internal/aiprompts/README.md",
    );
    expectAppServerAgentRule(
      readFile("internal/aiprompts/README.md"),
      "internal/aiprompts/README.md",
    );
  });

  it("keeps command/governance/quality skills aligned with current rules", () => {
    const skillFiles = [
      ".codex/skills/lime-command-boundary/SKILL.md",
      ".codex/skills/lime-governance/SKILL.md",
      ".codex/skills/lime-quality-workflow/SKILL.md",
    ];

    for (const filePath of skillFiles) {
      const content = readFile(filePath);

      expectNoBrandPrefixRule(content, filePath);
      expectAppServerAgentRule(content, filePath);
      expect(content, filePath).toMatch(/Electron/);
      expect(content, filePath).toMatch(/App Server/);
    }
  });

  it("keeps testing rules on Electron current evidence", () => {
    const content = readFile("internal/aiprompts/quality-workflow.md");

    expect(content).toContain("测试用例需要全面更新口径");
    expect(content).toContain("Electron Desktop Host");
    expect(content).toContain("App Server JSON-RPC");
    expect(content).toContain("src/lib/desktop-host/");
    expect(content).toContain("packages/app-server-client");
    expect(content).toContain("smoke:electron");
    expect(content).toContain("不得作为新改动的可交付证据");
  });

  it("keeps Vitest smoke runner aliases on desktop-host current naming", () => {
    const content = readFile("scripts/lib/vitest-smoke-runner.mjs");

    expect(content).toContain("desktopHostAliasPatterns");
    expect(content).toContain("desktopHostDir");
    expect(content).toContain("src/lib/desktop-host");
    expect(content).not.toContain(["Ta", "uriAliasPatterns"].join(""));
    expect(content).not.toContain(["ta", "uriMockDir"].join(""));
    expect(content).not.toContain(retiredHostMockDir());
    expect(content).not.toContain("lime-vitest-smoke-");
  });

  it("keeps Vitest layer classifier from treating legacy desktop host API as desktop-host current", () => {
    const content = readFile("scripts/lib/vitest-layer-classifier.mjs");

    expect(content).toContain('reason: "desktop-host-api"');
    expect(content).toContain("desktop-host|DesktopHost");
    expect(content).toContain('reason: "legacy-desktop-host-api"');
    expect(content).toContain(retiredHostPackagePatternSource());
    expect(content).toContain(retiredHostGlobalPatternSource());
    expect(content).not.toContain(retiredHostPackageName());
    expect(content).not.toContain(retiredHostGlobalName());
    expect(content).not.toContain(
      `reason: "desktop-host-api", pattern: /${retiredHostPackageName()}`,
    );
  });

  it("keeps renderer HTML entrypoint free of retired desktop host probes", () => {
    const content = readFile("index.html");

    expect(content).not.toContain(retiredHostPackageName());
    expect(content).not.toContain(retiredHostGlobalName());
    expect(content).not.toContain(retiredHostInternalsName());
    expect(content).not.toContain(retiredHostMockDir());
    expect(content).not.toContain("SC_DISABLE_SPEEDY");
  });
});
