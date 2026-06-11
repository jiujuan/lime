import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseOemCloudAccess,
  mockApiKeyProviderSection,
  mockHandleGoogleLogin,
  mockOpenUserCenter,
} = vi.hoisted(() => ({
  mockUseOemCloudAccess: vi.fn(),
  mockApiKeyProviderSection: vi.fn(),
  mockHandleGoogleLogin: vi.fn(),
  mockOpenUserCenter: vi.fn(),
}));

vi.mock("@/components/api-key-provider", () => ({
  ApiKeyProviderSection: (props: {
    className?: string;
    exposeOemLoginPrompt?: boolean;
    onOemLogin?: () => void;
  }) => {
    mockApiKeyProviderSection(props);
    return (
      <button
        type="button"
        data-testid="api-key-provider-stub"
        className={props.className}
        onClick={() => props.onOemLogin?.()}
      >
        API Key Provider 设置占位
      </button>
    );
  },
}));

vi.mock("@/hooks/useOemCloudAccess", () => ({
  useOemCloudAccess: () => mockUseOemCloudAccess(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const dictionary: Record<string, string> = {
        "settings.tab.providers": "AI 服务商",
        "settings.providers.cloud.brandFallback": "Lime Cloud",
        "settings.providers.cloud.message.userCenterMissing":
          "云端用户中心不可用",
        "settings.providers.cloud.message.loginOpened":
          "已打开 {{brand}} 登录",
        "settings.providers.cloud.message.userCenterOpened":
          "已打开 {{brand}} 用户中心",
        "settings.providers.cloud.message.browserRetry": "请在浏览器重试",
        "settings.providers.cloud.message.userCenterOpenFailed":
          "打开 {{brand}} 用户中心失败：{{detail}}",
      };
      return (dictionary[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );
    },
  }),
}));

import { CloudProviderSettings } from ".";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function createAccessState(overrides: Record<string, unknown> = {}) {
  return {
    runtime: null,
    hubProviderName: "Lime Cloud",
    session: null,
    initializing: false,
    openingGoogleLogin: false,
    errorMessage: null,
    infoMessage: null,
    handleGoogleLogin: mockHandleGoogleLogin,
    openUserCenter: mockOpenUserCenter,
    ...overrides,
  };
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CloudProviderSettings initialView="cloud" />);
  });

  mounted.push({ container, root });
  return container;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  mockUseOemCloudAccess.mockReturnValue(createAccessState());
  mockHandleGoogleLogin.mockResolvedValue(undefined);
  mockOpenUserCenter.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();

  while (mounted.length > 0) {
    const current = mounted.pop();
    if (!current) {
      break;
    }
    act(() => {
      current.root.unmount();
    });
    current.container.remove();
  }
});

describe("CloudProviderSettings", () => {
  it("应只渲染 Provider 主区，不再暴露桌宠工作区", () => {
    const container = renderPage();
    const text = container.textContent ?? "";

    expect(container.querySelector("h1")?.textContent).toBe("AI 服务商");
    expect(
      container.querySelector('[data-testid="api-key-provider-stub"]')
        ?.className,
    ).toContain("h-[calc(100vh-280px)]");
    expect(
      container.querySelector('[data-testid="provider-workspace-switcher"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="companion-provider-card"]'),
    ).toBeNull();
    expect(text).toContain("API Key Provider 设置占位");
    expect(text).not.toContain("桌宠");
    expect(text).not.toContain("Companion");
    expect(text).not.toContain("Lime Pet");
  });

  it("OEM 未登录时仍把登录动作接给 Provider 主区", async () => {
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        runtime: { baseUrl: "https://cloud.example.test" },
        session: null,
      }),
    );

    const container = renderPage();
    const providerProps = mockApiKeyProviderSection.mock.calls.at(-1)?.[0] as
      | { exposeOemLoginPrompt?: boolean }
      | undefined;
    const loginButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="api-key-provider-stub"]',
    );

    expect(providerProps?.exposeOemLoginPrompt).toBe(true);

    await act(async () => {
      loginButton?.click();
      await Promise.resolve();
    });

    expect(mockHandleGoogleLogin).toHaveBeenCalledTimes(1);
    expect(container.textContent ?? "").toContain("已打开 Lime Cloud 登录");
  });

  it("OEM 已登录时仍把用户中心动作接给 Provider 主区", async () => {
    mockUseOemCloudAccess.mockReturnValue(
      createAccessState({
        runtime: { baseUrl: "https://cloud.example.test" },
        session: { user: { id: "user-1" } },
      }),
    );

    const container = renderPage();
    const providerProps = mockApiKeyProviderSection.mock.calls.at(-1)?.[0] as
      | { exposeOemLoginPrompt?: boolean }
      | undefined;
    const loginButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="api-key-provider-stub"]',
    );

    expect(providerProps?.exposeOemLoginPrompt).toBe(false);

    await act(async () => {
      loginButton?.click();
      await Promise.resolve();
    });

    expect(mockOpenUserCenter).toHaveBeenCalledWith("/welcome");
    expect(container.textContent ?? "").toContain(
      "已打开 Lime Cloud 用户中心",
    );
  });
});
