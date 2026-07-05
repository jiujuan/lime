import { describe, expect, it } from "vitest";
import { buildModelNativeToolPolicy } from "./modelNativeToolPolicy";

describe("modelNativeToolPolicy", () => {
  it("缺字段时 fail closed，不推断 native tool surface", () => {
    expect(buildModelNativeToolPolicy(null)).toEqual({
      shell_type: null,
      shell_tool_enabled: false,
      preferred_shell_surface: null,
      apply_patch_tool_type: null,
      apply_patch_tool_enabled: false,
      experimental_supported_tools: [],
    });
  });

  it("按 Codex shell_type 投影模型偏好的 shell surface", () => {
    expect(buildModelNativeToolPolicy({ shell_type: "shell_command" })).toMatchObject({
      shell_type: "shell_command",
      shell_tool_enabled: true,
      preferred_shell_surface: "shell_command",
    });
    expect(buildModelNativeToolPolicy({ shell_type: "default" })).toMatchObject({
      shell_type: "default",
      shell_tool_enabled: true,
      preferred_shell_surface: "shell_command",
    });
    expect(buildModelNativeToolPolicy({ shell_type: "local" })).toMatchObject({
      shell_type: "local",
      shell_tool_enabled: true,
      preferred_shell_surface: "shell_command",
    });
    expect(buildModelNativeToolPolicy({ shell_type: "unified_exec" })).toMatchObject({
      shell_type: "unified_exec",
      shell_tool_enabled: true,
      preferred_shell_surface: "unified_exec",
    });
    expect(buildModelNativeToolPolicy({ shell_type: "disabled" })).toMatchObject({
      shell_type: "disabled",
      shell_tool_enabled: false,
      preferred_shell_surface: null,
    });
  });

  it("支持 generated TS camelCase 字段与破折号 token 归一", () => {
    expect(
      buildModelNativeToolPolicy({
        shellType: "unified-exec",
        applyPatchToolType: "freeform",
        experimentalSupportedTools: ["Test-Sync-Tool"],
      }),
    ).toEqual({
      shell_type: "unified_exec",
      shell_tool_enabled: true,
      preferred_shell_surface: "unified_exec",
      apply_patch_tool_type: "freeform",
      apply_patch_tool_enabled: true,
      experimental_supported_tools: ["test_sync_tool"],
    });
  });

  it("只接受 Codex apply_patch_tool_type=freeform", () => {
    expect(
      buildModelNativeToolPolicy({
        apply_patch_tool_type: "freeform",
      }).apply_patch_tool_enabled,
    ).toBe(true);
    expect(
      buildModelNativeToolPolicy({
        apply_patch_tool_type: "structured",
      }),
    ).toMatchObject({
      apply_patch_tool_type: null,
      apply_patch_tool_enabled: false,
    });
  });

  it("experimental_supported_tools 只保留稳定去重后的字符串 token", () => {
    expect(
      buildModelNativeToolPolicy({
        experimental_supported_tools: [
          "test_sync_tool",
          "Test-Sync-Tool",
          "",
          1,
          null,
        ],
      }).experimental_supported_tools,
    ).toEqual(["test_sync_tool"]);
  });

  it("不会从 generic tools、capability summary 或 picker/catalog 字段推断", () => {
    expect(
      buildModelNativeToolPolicy({
        supports_tools: true,
        capabilities: { tools: true },
        runtime_features: ["shell"],
        task_families: ["coding"],
        provider_name: "OpenAI",
        display_name: "GPT",
      } as Record<string, unknown>),
    ).toEqual({
      shell_type: null,
      shell_tool_enabled: false,
      preferred_shell_surface: null,
      apply_patch_tool_type: null,
      apply_patch_tool_enabled: false,
      experimental_supported_tools: [],
    });
  });
});
