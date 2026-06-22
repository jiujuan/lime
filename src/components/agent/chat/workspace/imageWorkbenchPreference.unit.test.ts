import { describe, expect, it } from "vitest";
import { resolveImageWorkbenchPreferenceViewModel } from "./imageWorkbenchPreference";

describe("resolveImageWorkbenchPreferenceViewModel", () => {
  it("应按项目偏好生成来源和 provider/model 摘要", () => {
    expect(
      resolveImageWorkbenchPreferenceViewModel({
        preference: {
          source: "project",
          preferredProviderId: "fal",
          allowFallback: true,
        },
        selectedProvider: { name: "Fal AI" },
        selectedProviderId: "fal",
        selectedModel: { name: "Flux Pro" },
        selectedModelId: "flux-pro",
        preferredProviderUnavailable: false,
        mediaDefaultsLoading: false,
        providersLoading: false,
      }),
    ).toEqual({
      sourceLabel: "项目图片设置",
      preferenceSummary: "来源：项目图片设置 · Fal AI / Flux Pro",
      preferenceWarning: null,
      selectionWarning: null,
      selectionReady: true,
    });
  });

  it("provider 或 model 名称为空时应回退到 id", () => {
    expect(
      resolveImageWorkbenchPreferenceViewModel({
        preference: {
          source: "global",
          preferredProviderId: "zhipuai",
          allowFallback: true,
        },
        selectedProvider: { name: " " },
        selectedProviderId: "zhipuai",
        selectedModel: null,
        selectedModelId: "cogview-4",
        preferredProviderUnavailable: false,
        mediaDefaultsLoading: false,
        providersLoading: false,
      }).preferenceSummary,
    ).toBe("来源：全局图片设置 · zhipuai / cogview-4");
  });

  it("加载 provider 或默认设置时应阻止生成", () => {
    const viewModel = resolveImageWorkbenchPreferenceViewModel({
      preference: {
        source: "auto",
        allowFallback: true,
      },
      selectedProviderId: "fal",
      selectedModelId: "flux-pro",
      preferredProviderUnavailable: false,
      mediaDefaultsLoading: true,
      providersLoading: false,
    });

    expect(viewModel.selectionReady).toBe(false);
    expect(viewModel.selectionWarning).toBe(
      "图片服务设置加载中，请稍后生成图层资产。",
    );
  });

  it("首选 provider 不可用且禁止 fallback 时应返回偏好警告", () => {
    const viewModel = resolveImageWorkbenchPreferenceViewModel({
      preference: {
        source: "project",
        preferredProviderId: "missing-provider",
        allowFallback: false,
      },
      selectedProviderId: "",
      selectedModelId: "",
      preferredProviderUnavailable: true,
      mediaDefaultsLoading: false,
      providersLoading: false,
    });

    expect(viewModel.preferenceWarning).toBe(
      "默认图片服务 missing-provider 当前不可用，且已关闭自动回退。",
    );
    expect(viewModel.selectionWarning).toBe(viewModel.preferenceWarning);
    expect(viewModel.selectionReady).toBe(false);
  });

  it("未选定 provider 或 model 时应要求确认媒体服务设置", () => {
    const viewModel = resolveImageWorkbenchPreferenceViewModel({
      preference: {
        source: "auto",
        allowFallback: true,
      },
      selectedProviderId: "fal",
      selectedModelId: "",
      preferredProviderUnavailable: false,
      mediaDefaultsLoading: false,
      providersLoading: false,
    });

    expect(viewModel.selectionReady).toBe(false);
    expect(viewModel.selectionWarning).toBe(
      "图片服务尚未选定 Provider/模型，请先到媒体服务图片设置确认默认渠道。",
    );
  });
});
