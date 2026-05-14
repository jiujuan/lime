import { describe, expect, it } from "vitest";
import { resolveAgentAppHostFlags } from "./featureFlag";

describe("Agent App feature flags", () => {
  it("默认关闭 Lab 和所有运行能力", () => {
    expect(resolveAgentAppHostFlags()).toMatchObject({
      labEnabled: false,
      localPackageEnabled: false,
      projectionEnabled: false,
      readinessEnabled: false,
      cleanupDryRunEnabled: false,
      mockSdkEnabled: false,
      localStorageEnabled: false,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: false,
    });
  });

  it("开启 labEnabled 时只打开 P0 只读链路", () => {
    expect(resolveAgentAppHostFlags({ labEnabled: true })).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      mockSdkEnabled: false,
      localStorageEnabled: false,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: false,
    });
  });
});
