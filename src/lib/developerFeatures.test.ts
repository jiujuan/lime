import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAW_TRACE_DEBUG_OVERRIDE_KEY,
  WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY,
  normalizeClawTraceConfig,
  normalizeDeveloperConfig,
  readClawTraceDebugOverride,
  readWorkspaceHarnessDebugOverride,
  resolveClawTraceEnabled,
  resolveWorkspaceHarnessEnabled,
} from "./developerFeatures";

describe("developerFeatures", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("未设置调试覆盖时应返回 null", () => {
    expect(readWorkspaceHarnessDebugOverride()).toBeNull();
  });

  it("应识别处理工作台调试覆盖开关", () => {
    window.localStorage.setItem(WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY, "true");
    expect(readWorkspaceHarnessDebugOverride()).toBe(true);

    window.localStorage.setItem(WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY, "off");
    expect(readWorkspaceHarnessDebugOverride()).toBe(false);
  });

  it("调试覆盖存在时应优先于配置值", () => {
    window.localStorage.setItem(WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY, "1");

    expect(
      resolveWorkspaceHarnessEnabled({
        developer: { workspace_harness_enabled: false },
      }),
    ).toBe(true);
  });

  it("没有调试覆盖时应回退到配置值", () => {
    expect(
      resolveWorkspaceHarnessEnabled({
        developer: { workspace_harness_enabled: true },
      }),
    ).toBe(true);
    expect(
      resolveWorkspaceHarnessEnabled({
        developer: { workspace_harness_enabled: false },
      }),
    ).toBe(false);
  });

  it("应默认关闭 Claw Trace，并规范化采样率和级别", () => {
    expect(normalizeDeveloperConfig(null).claw_trace).toEqual({
      alert_enabled: false,
      enabled: false,
      level: "summary",
      sample_rate: 1,
    });

    expect(
      normalizeClawTraceConfig({
        alert_enabled: true,
        enabled: true,
        level: "debug",
        sample_rate: 2,
      }),
    ).toEqual({
      alert_enabled: true,
      enabled: true,
      level: "debug",
      sample_rate: 1,
    });

    expect(
      normalizeClawTraceConfig({
        alert_enabled: false,
        enabled: true,
        level: "summary",
        sample_rate: -1,
      }),
    ).toEqual({
      alert_enabled: false,
      enabled: true,
      level: "summary",
      sample_rate: 0,
    });
  });

  it("Claw Trace 调试覆盖应独立于 Harness 开关", () => {
    window.localStorage.setItem(CLAW_TRACE_DEBUG_OVERRIDE_KEY, "on");
    expect(readClawTraceDebugOverride()).toBe(true);
    expect(readWorkspaceHarnessDebugOverride()).toBeNull();

    expect(
      resolveClawTraceEnabled({
        developer: {
          workspace_harness_enabled: false,
          claw_trace: { enabled: false },
        },
      }),
    ).toBe(true);
  });

  it("Claw Trace 没有调试覆盖时应回退到独立配置", () => {
    expect(
      resolveClawTraceEnabled({
        developer: {
          workspace_harness_enabled: true,
          claw_trace: { enabled: false },
        },
      }),
    ).toBe(false);

    expect(
      resolveClawTraceEnabled({
        developer: {
          workspace_harness_enabled: false,
          claw_trace: { enabled: true, sample_rate: 1 },
        },
      }),
    ).toBe(true);

    expect(
      resolveClawTraceEnabled({
        developer: {
          claw_trace: { enabled: true, sample_rate: 0 },
        },
      }),
    ).toBe(false);
  });
});
