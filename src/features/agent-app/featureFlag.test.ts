import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_APP_HOST_FLAGS_STORAGE_KEY,
  resolveAgentAppHostFlags,
} from "./featureFlag";

describe("Agent App feature flags", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("默认关闭 Lab 和所有运行能力", () => {
    expect(resolveAgentAppHostFlags()).toMatchObject({
      labEnabled: false,
      localPackageEnabled: false,
      projectionEnabled: false,
      readinessEnabled: false,
      cleanupDryRunEnabled: false,
      mockSdkEnabled: false,
      localStorageEnabled: false,
      realAdapterEnabled: false,
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
      realAdapterEnabled: false,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: false,
    });
  });

  it("开启 mockSdkEnabled 时应进入 P1 mock SDK 但仍不启用真实运行时", () => {
    expect(resolveAgentAppHostFlags({ mockSdkEnabled: true })).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      mockSdkEnabled: true,
      localStorageEnabled: false,
      realAdapterEnabled: false,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: false,
    });
  });

  it("开启 realAdapterEnabled 时应进入 P2 adapter 链路但仍不启用 UI/worker runtime", () => {
    expect(resolveAgentAppHostFlags({ realAdapterEnabled: true })).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      mockSdkEnabled: false,
      localStorageEnabled: true,
      realAdapterEnabled: true,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: false,
    });
  });

  it("开启 uiRuntimeEnabled 时应进入 P3 UI host 但仍不启用 worker runtime", () => {
    expect(resolveAgentAppHostFlags({ uiRuntimeEnabled: true })).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      mockSdkEnabled: false,
      realAdapterEnabled: false,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: false,
    });
  });

  it("开启 workerRuntimeEnabled 时应进入 P4.2 workflow runtime 但不自动启用 adapter", () => {
    expect(resolveAgentAppHostFlags({ workerRuntimeEnabled: true })).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      mockSdkEnabled: false,
      localStorageEnabled: false,
      realAdapterEnabled: false,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: true,
    });
  });

  it("开启 cloudBootstrapEnabled 时只进入 P5 bootstrap 输入层，不自动运行 App", () => {
    expect(resolveAgentAppHostFlags({ cloudBootstrapEnabled: true })).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      mockSdkEnabled: false,
      localStorageEnabled: false,
      realAdapterEnabled: false,
      uiRuntimeEnabled: false,
      workerRuntimeEnabled: false,
      cloudBootstrapEnabled: true,
    });
  });

  it("本地 Lab flags storage 可用于 GUI smoke 打开 P15 实验运行能力", () => {
    window.localStorage.setItem(
      AGENT_APP_HOST_FLAGS_STORAGE_KEY,
      JSON.stringify({
        labEnabled: true,
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }),
    );

    expect(resolveAgentAppHostFlags()).toMatchObject({
      labEnabled: true,
      localPackageEnabled: true,
      projectionEnabled: true,
      readinessEnabled: true,
      cleanupDryRunEnabled: true,
      localStorageEnabled: true,
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: false,
    });
  });
});
