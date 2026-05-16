import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

import {
  LIME_AGENT_APP_BRIDGE_PROTOCOL,
  LIME_AGENT_APP_BRIDGE_VERSION,
  LIME_CAPABILITY_NAMES,
  MockCapabilityHost,
  createLimeCoreCapabilityAdapters,
  createLimeHostBridgeCapabilityInvoker,
  createMockLimeCapabilityTransport,
  isLimeCapabilityErrorCode,
  normalizeLimeCapabilityErrorCode,
} from "./index";
import * as publicSdkSurface from "./index";

const publicSdkSource = readFileSync(
  path.resolve(process.cwd(), "src/features/agent-app/sdk/index.ts"),
  "utf8",
);

describe("agent app SDK public surface", () => {
  it("只导出 App package 需要的 SDK facade 和 Host Bridge client", () => {
    expect(LIME_AGENT_APP_BRIDGE_PROTOCOL).toBe("lime.agentApp.bridge");
    expect(LIME_AGENT_APP_BRIDGE_VERSION).toBe(1);
    expect(LIME_CAPABILITY_NAMES).toContain("lime.agent");
    expect(isLimeCapabilityErrorCode("permission_denied")).toBe(true);
    expect(normalizeLimeCapabilityErrorCode("missing")).toBe("upstream_failed");
    expect(typeof createLimeCoreCapabilityAdapters).toBe("function");
    expect(typeof createLimeHostBridgeCapabilityInvoker).toBe("function");
    expect(typeof createMockLimeCapabilityTransport).toBe("function");
    expect(typeof MockCapabilityHost).toBe("function");
  });

  it("不导出客户端 UI、安装器或 runtime host 内部实现", () => {
    expect(publicSdkSurface).not.toHaveProperty("AgentAppsPage");
    expect(publicSdkSurface).not.toHaveProperty("AgentAppRuntimePage");
    expect(publicSdkSurface).not.toHaveProperty("buildInstalledAppPreview");
    expect(publicSdkSurface).not.toHaveProperty(
      "LocalInstalledAgentAppStateRepository",
    );
    expect(publicSdkSurface).not.toHaveProperty("AgentRuntimeCapabilityHost");
    expect(publicSdkSurface).not.toHaveProperty("WorkflowRuntimeHost");
    expect(publicSdkSurface).not.toHaveProperty("createAgentAppCapabilityDispatcher");
  });

  it("源码层不从 UI、安装、运行时或 adapter 内部层转导出", () => {
    expect(publicSdkSource).not.toMatch(/from "\.\.\/ui\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/install\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/runtime\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/adapters\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/schema\//);
  });
});
