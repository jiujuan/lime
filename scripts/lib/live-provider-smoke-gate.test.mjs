import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIVE_PROVIDER_SMOKE_ENV,
  REAL_API_TEST_ENV,
  assertLiveProviderSmokeAllowed,
  isLiveProviderTestPath,
  liveProviderSmokeAllowed,
  liveProviderSmokeEnv,
} from "./live-provider-smoke-gate.mjs";

describe("live-provider-smoke-gate", () => {
  it("默认禁止 live Provider smoke", () => {
    expect(liveProviderSmokeAllowed({})).toBe(false);
  });

  it("显式环境变量允许 live Provider smoke", () => {
    expect(liveProviderSmokeAllowed({ [LIVE_PROVIDER_SMOKE_ENV]: "1" })).toBe(
      true,
    );
    expect(liveProviderSmokeAllowed({ [REAL_API_TEST_ENV]: "true" })).toBe(
      true,
    );
  });

  it("禁止时应给出明确的显式开启提示", () => {
    expect(() =>
      assertLiveProviderSmokeAllowed({
        allowed: false,
        scriptName: "smoke:test",
      }),
    ).toThrow(/--allow-live-provider/);
  });

  it("透传子进程 env 时应只补允许标记", () => {
    expect(liveProviderSmokeEnv({ NODE_ENV: "test" })).toEqual({
      NODE_ENV: "test",
      [LIVE_PROVIDER_SMOKE_ENV]: "1",
    });
  });

  it("应识别 live Provider 测试文件路径", () => {
    expect(
      isLiveProviderTestPath(
        "src/components/image-gen/useImageGen.live.test.ts",
      ),
    ).toBe(true);
    expect(
      isLiveProviderTestPath(
        "src\\components\\image-gen\\useImageGen.live.test.ts",
      ),
    ).toBe(true);
    expect(
      isLiveProviderTestPath("src/components/image-gen/useImageGen.test.ts"),
    ).toBe(false);
  });

  it("Vitest 智能入口默认应阻断直接点名 live Provider 测试", () => {
    const result = spawnSync(
      "node",
      [
        "scripts/run-vitest-smart.mjs",
        "src/components/image-gen/useImageGen.live.test.ts",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          [LIVE_PROVIDER_SMOKE_ENV]: "",
          [REAL_API_TEST_ENV]: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("默认禁止执行");
  });

  it("内容工厂 full-flow 默认应在调用 DevBridge 前阻断 live Provider", () => {
    const result = spawnSync(
      "node",
      ["scripts/agent-apps-content-factory-flow.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          [LIVE_PROVIDER_SMOKE_ENV]: "",
          [REAL_API_TEST_ENV]: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("默认禁止执行");
  });

  it("Agent Apps 内容工厂 action E2E 默认应阻断 live Provider", () => {
    const result = spawnSync(
      "node",
      ["scripts/agent-apps-smoke.mjs", "--include-content-factory-action-e2e"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          [LIVE_PROVIDER_SMOKE_ENV]: "",
          [REAL_API_TEST_ENV]: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("默认禁止执行");
  });

  it("知识库真实 Provider E2E 即使指定 provider/model 也必须显式授权", () => {
    const result = spawnSync(
      "node",
      [
        "scripts/knowledge-provider-e2e.mjs",
        "--provider",
        "deepseek",
        "--model",
        "deepseek-v4-flash",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          [LIVE_PROVIDER_SMOKE_ENV]: "",
          [REAL_API_TEST_ENV]: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("默认禁止执行");
  });

  it("Managed Objective continuation 指定 Deepseek 时必须显式授权", () => {
    const result = spawnSync(
      "node",
      [
        "scripts/managed-objective-continuation-smoke.mjs",
        "--provider-preference",
        "deepseek",
        "--model-preference",
        "deepseek-v4-flash",
        "--no-write",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          [LIVE_PROVIDER_SMOKE_ENV]: "",
          [REAL_API_TEST_ENV]: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("默认禁止执行");
  });

  it("提交真实 AgentRuntime / Provider 的脚本必须默认接入 live gate", () => {
    const riskyCommandPattern =
      /"agent_runtime_submit_turn"|"test_api_key_provider_chat"/;
    const violations = listSmokeScripts()
      .filter(({ content }) => riskyCommandPattern.test(content))
      .filter(({ content }) => {
        const hasLiveGate = content.includes("assertLiveProviderSmokeAllowed(");
        const hasDefaultNoSubmitPath =
          content.includes("if (!options.allowLiveProvider)") &&
          content.includes("not_submitted") &&
          content.includes("默认未提交");
        return !hasLiveGate && !hasDefaultNoSubmitPath;
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it("知识包 E2E 编译默认必须关闭 Builder Runtime 或显式要求 live 授权", () => {
    const violations = listSmokeScripts()
      .filter(({ content }) => content.includes('"knowledge_compile_pack"'))
      .filter(({ content }) => {
        const hasLiveGate = content.includes("assertLiveProviderSmokeAllowed(");
        const explicitlyDisablesBuilderRuntime =
          /builderRuntime:\s*\{\s*enabled:\s*false/s.test(content);
        return !hasLiveGate && !explicitlyDisablesBuilderRuntime;
      })
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });
});

function listSmokeScripts() {
  const scriptsDir = path.join(process.cwd(), "scripts");
  return fs
    .readdirSync(scriptsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".mjs") &&
        !entry.name.startsWith("check-"),
    )
    .map((entry) => {
      const filePath = path.join(scriptsDir, entry.name);
      return {
        relativePath: path
          .relative(process.cwd(), filePath)
          .replaceAll("\\", "/"),
        content: fs.readFileSync(filePath, "utf8"),
      };
    });
}
