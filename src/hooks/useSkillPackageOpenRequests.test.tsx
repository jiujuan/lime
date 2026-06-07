import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSkillPackageOpenRequests } from "./useSkillPackageOpenRequests";

const mocks = vi.hoisted(() => ({
  safeListen: vi.fn(),
  takePendingSkillPackageOpenRequests: vi.fn(),
  hasDesktopHostInvokeCapability: vi.fn(),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeListen: (...args: unknown[]) => mocks.safeListen(...args),
}));

vi.mock("@/lib/api/skills", () => ({
  SKILL_PACKAGE_OPEN_EVENT: "skill-package://open",
  skillsApi: {
    takePendingSkillPackageOpenRequests: (...args: unknown[]) =>
      mocks.takePendingSkillPackageOpenRequests(...args),
  },
}));

vi.mock("@/lib/desktop-runtime", () => ({
  hasDesktopHostInvokeCapability: () => mocks.hasDesktopHostInvokeCapability(),
}));

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function Probe({
  onNavigate,
}: {
  onNavigate: Parameters<typeof useSkillPackageOpenRequests>[0]["onNavigate"];
}) {
  useSkillPackageOpenRequests({ onNavigate });
  return null;
}

async function renderHookProbe(onNavigate = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Probe onNavigate={onNavigate} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  mountedRoots.push({ container, root });
  return { onNavigate };
}

describe("useSkillPackageOpenRequests", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.safeListen.mockReset();
    mocks.safeListen.mockResolvedValue(vi.fn());
    mocks.takePendingSkillPackageOpenRequests.mockReset();
    mocks.takePendingSkillPackageOpenRequests.mockResolvedValue([]);
    mocks.hasDesktopHostInvokeCapability.mockReset();
    mocks.hasDesktopHostInvokeCapability.mockReturnValue(true);
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }
      act(() => mounted.root.unmount());
      mounted.container.remove();
    }
    vi.clearAllMocks();
  });

  it("启动后应消费 pending .skill 请求并导航到 Skills 安装页", async () => {
    mocks.takePendingSkillPackageOpenRequests.mockResolvedValue([
      "/Users/demo/article-typesetting-master.skill",
    ]);
    const { onNavigate } = await renderHookProbe();

    expect(mocks.safeListen).toHaveBeenCalledWith(
      "skill-package://open",
      expect.any(Function),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "skills",
      expect.objectContaining({
        initialView: "installed",
        initialSkillPackagePath: "/Users/demo/article-typesetting-master.skill",
        initialSkillPackageName: "article-typesetting-master.skill",
        initialSkillPackageRequestKey: expect.any(Number),
      }),
    );
  });

  it("收到后续系统打开事件时应打开最新的 .skill 包", async () => {
    const { onNavigate } = await renderHookProbe();
    const listener = mocks.safeListen.mock.calls[0]?.[1] as
      | ((event: { payload: string[] }) => void)
      | undefined;

    await act(async () => {
      listener?.({
        payload: ["/Users/demo/old.skill", "/Users/demo/latest.skill"],
      });
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "skills",
      expect.objectContaining({
        initialSkillPackagePath: "/Users/demo/latest.skill",
        initialSkillPackageName: "latest.skill",
      }),
    );
  });

  it("收到 .skills 包打开事件时也应导航到 Skills 安装页", async () => {
    const { onNavigate } = await renderHookProbe();
    const listener = mocks.safeListen.mock.calls[0]?.[1] as
      | ((event: { payload: string[] }) => void)
      | undefined;

    await act(async () => {
      listener?.({
        payload: ["/Users/demo/latest.skills"],
      });
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "skills",
      expect.objectContaining({
        initialSkillPackagePath: "/Users/demo/latest.skills",
        initialSkillPackageName: "latest.skills",
      }),
    );
  });

  it("非 Desktop Host 运行时不应注册文件打开监听", async () => {
    mocks.hasDesktopHostInvokeCapability.mockReturnValue(false);
    await renderHookProbe();

    expect(mocks.safeListen).not.toHaveBeenCalled();
    expect(mocks.takePendingSkillPackageOpenRequests).not.toHaveBeenCalled();
  });
});
