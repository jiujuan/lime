import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { InputbarRuntimeStatusLine } from "./InputbarRuntimeStatusLine";
import type { InputbarRuntimeStatusLineModel } from "../../../utils/inputbarRuntimeStatusLine";

const mockUseConfiguredProviders = vi.fn();

vi.mock("@/hooks/useConfiguredProviders", () => ({
  useConfiguredProviders: (options: unknown) =>
    mockUseConfiguredProviders(options),
  resolveConfiguredProviderPromptCacheSupportNotice: (
    providers: Array<{ key: string; providerId?: string; type?: string }>,
    selection?: string | null,
  ) => {
    const normalizedSelection = (selection || "").trim().toLowerCase();
    const selectedProvider =
      providers.find(
        (provider) => provider.key.trim().toLowerCase() === normalizedSelection,
      ) ??
      providers.find(
        (provider) =>
          (provider.providerId || "").trim().toLowerCase() ===
          normalizedSelection,
      ) ??
      null;

    if (
      (selectedProvider?.type || "").trim().toLowerCase() ===
      "anthropic-compatible"
    ) {
      return {
        label: "未声明自动缓存",
        detail:
          "当前 Provider 未声明支持自动 Prompt Cache；如需复用前缀，请使用显式 cache_control 标记。",
        source: "configured_provider" as const,
      };
    }

    return null;
  },
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");

  mockUseConfiguredProviders.mockReturnValue({
    providers: [],
    loading: false,
  });
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
  await changeLimeLocale("en-US");
});

function renderStatusLine(
  runtime: InputbarRuntimeStatusLineModel,
  props?: Partial<React.ComponentProps<typeof InputbarRuntimeStatusLine>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InputbarRuntimeStatusLine
        runtime={runtime}
        providerType="custom-provider-id"
        {...props}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

function buildRuntime(
  usage: NonNullable<InputbarRuntimeStatusLineModel["usage"]>,
): InputbarRuntimeStatusLineModel {
  return {
    status: "completed",
    detail: null,
    batchDescriptor: {
      kind: "exploration",
      title: "已查看关键文件",
      supportingLines: ["查看 query.ts", "查看 toolExecution.ts"],
      countLabel: "读 2",
      rawDetailLabel: "读 2",
    },
    queuedTurnCount: 0,
    pendingRequestCount: 0,
    subtaskStats: null,
    usage,
    startedAt: "2026-04-15T09:00:00Z",
    completedAt: "2026-04-15T09:00:15Z",
  };
}

describe("InputbarRuntimeStatusLine", () => {
  it("无缓存命中时应稳定展示缓存 0 与轻量提示", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "custom-provider-id",
          label: "GLM Anthropic",
          registryId: "custom-provider-id",
          type: "anthropic-compatible",
          providerId: "custom-provider-id",
        },
      ],
      loading: false,
    });

    const container = renderStatusLine(
      buildRuntime({
        input_tokens: 25_400,
        output_tokens: 238,
        cached_input_tokens: 0,
      }),
    );

    expect(container.textContent).toContain("已完成");
    expect(container.textContent).toContain("00:15");
    expect(container.textContent).toContain("工具 读 2");
    expect(container.textContent).toContain("输入 25.4K / 输出 238");
    expect(container.textContent).toContain("缓存 0");
    expect(container.textContent).toContain("未声明自动缓存");
  });

  it("存在缓存写入时应展示缓存总量与读写拆分且不再展示轻量提示", () => {
    mockUseConfiguredProviders.mockReturnValue({
      providers: [
        {
          key: "custom-provider-id",
          label: "GLM Anthropic",
          registryId: "custom-provider-id",
          type: "anthropic-compatible",
          providerId: "custom-provider-id",
        },
      ],
      loading: false,
    });

    const container = renderStatusLine(
      buildRuntime({
        input_tokens: 25_400,
        output_tokens: 238,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 1_200,
      }),
    );

    expect(container.textContent).toContain("缓存 1.2K");
    expect(container.textContent).toContain("读 0 / 写 1.2K");
    expect(container.textContent).not.toContain("未声明自动缓存");
  });

  it("等待补充详情不应生成原生 title 浮窗", () => {
    const detail =
      "若回复加入团队将带来巨大技术突破，请补充目标、边界、风险和最终交付口径。";
    const container = renderStatusLine({
      status: "waiting_input",
      detail,
      batchDescriptor: null,
      queuedTurnCount: 0,
      pendingRequestCount: 1,
      subtaskStats: null,
      startedAt: "2026-04-15T09:00:00Z",
      completedAt: null,
    });

    const statusLine = container.querySelector(
      '[data-testid="inputbar-runtime-status-line"]',
    );
    expect(statusLine?.textContent).toContain(detail);
    expect(statusLine?.querySelector(`[title="${detail}"]`)).toBeNull();
    expect(statusLine?.querySelector(`[aria-label="${detail}"]`)).not.toBeNull();
  });

  it("失败状态行应保持简短，不重复展示长错误详情", () => {
    const detail =
      "当前模型通道返回了计费或额度类错误，请检查该 Provider/模型通道的计费、配额或授权状态，或切换到其他可用模型后重试。";
    const container = renderStatusLine({
      status: "failed",
      detail,
      batchDescriptor: null,
      queuedTurnCount: 0,
      pendingRequestCount: 0,
      subtaskStats: null,
      startedAt: "2026-04-15T09:00:00Z",
      completedAt: "2026-04-15T09:00:09Z",
    });

    const statusLine = container.querySelector(
      '[data-testid="inputbar-runtime-status-line"]',
    );
    expect(statusLine?.textContent).toContain("失败");
    expect(statusLine?.textContent).toContain("00:09");
    expect(statusLine?.textContent).not.toContain(detail);
  });
});
