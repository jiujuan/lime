import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

import {
  LIME_PLUGIN_BRIDGE_PROTOCOL,
  LIME_PLUGIN_BRIDGE_VERSION,
  LIME_CAPABILITY_DEFINITIONS,
  LIME_CAPABILITY_NAMES,
  applyLimeHostTheme,
  createLimeCoreCapabilityAdapters,
  createLimeHostBridgeCapabilityInvoker,
  isLimeCapabilityErrorCode,
  normalizeLimeCapabilityErrorCode,
  syncLimeHostTheme,
} from "./index";
import * as publicSdkSurface from "./index";

const publicSdkSource = readFileSync(
  path.resolve(process.cwd(), "src/features/plugin/sdk/index.ts"),
  "utf8",
);

describe("plugin SDK public surface", () => {
  it("只导出 App package 需要的 SDK facade 和 Host Bridge client", () => {
    expect(LIME_PLUGIN_BRIDGE_PROTOCOL).toBe("lime.plugin.bridge");
    expect(LIME_PLUGIN_BRIDGE_VERSION).toBe(1);
    expect(LIME_CAPABILITY_NAMES).toContain("lime.agent");
    expect(LIME_CAPABILITY_DEFINITIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "lime.models" }),
        expect.objectContaining({ name: "lime.skills" }),
        expect.objectContaining({ name: "lime.usage" }),
      ]),
    );
    expect(isLimeCapabilityErrorCode("permission_denied")).toBe(true);
    expect(normalizeLimeCapabilityErrorCode("missing")).toBe("upstream_failed");
    expect(typeof createLimeCoreCapabilityAdapters).toBe("function");
    expect(typeof createLimeHostBridgeCapabilityInvoker).toBe("function");
    expect(typeof applyLimeHostTheme).toBe("function");
    expect(typeof syncLimeHostTheme).toBe("function");
    expect(publicSdkSurface).not.toHaveProperty(
      "createMockLimeCapabilityTransport",
    );
    expect(publicSdkSurface).not.toHaveProperty("MockCapabilityHost");
    expect(publicSdkSurface).not.toHaveProperty("buildMockCapabilityProfile");
  });

  it("不导出客户端 UI、安装器或 runtime host 内部实现", () => {
    expect(publicSdkSurface).not.toHaveProperty("PluginsPage");
    expect(publicSdkSurface).not.toHaveProperty("PluginRuntimePage");
    expect(publicSdkSurface).not.toHaveProperty("buildInstalledAppPreview");
    expect(publicSdkSurface).not.toHaveProperty(
      "LocalInstalledPluginStateRepository",
    );
    expect(publicSdkSurface).not.toHaveProperty("AgentRuntimeCapabilityHost");
    expect(publicSdkSurface).not.toHaveProperty("WorkflowRuntimeHost");
    expect(publicSdkSurface).not.toHaveProperty(
      "createPluginCapabilityDispatcher",
    );
  });

  it("源码层不从 UI、安装、运行时或 adapter 内部层转导出", () => {
    expect(publicSdkSource).not.toMatch(/from "\.\.\/ui\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/install\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/runtime\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/adapters\//);
    expect(publicSdkSource).not.toMatch(/from "\.\.\/schema\//);
  });
});
