import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyProjectCreatedWithRuntimeAgentsGuide,
  notifyProjectRuntimeAgentsGuide,
} from "./runtimeAgentsGuideService";

const {
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

describe("runtimeAgentsGuideService", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("首次创建项目时只展示成功提示，不再暴露旧运行时记忆初始化入口", () => {
    notifyProjectCreatedWithRuntimeAgentsGuide(
      {
        id: "project-1",
        name: "项目 A",
        rootPath: "/tmp/workspace/project-a",
      },
      "项目创建成功",
    );

    expect(mockToastSuccess).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith("项目创建成功");
  });

  it("同一项目重复通知时应退化为普通成功提示", () => {
    notifyProjectCreatedWithRuntimeAgentsGuide(
      {
        id: "project-1",
        name: "项目 A",
        rootPath: "/tmp/workspace/project-a",
      },
      "项目创建成功",
    );
    notifyProjectCreatedWithRuntimeAgentsGuide(
      {
        id: "project-1",
        name: "项目 A",
        rootPath: "/tmp/workspace/project-a",
      },
      "项目创建成功",
    );

    expect(mockToastSuccess).toHaveBeenNthCalledWith(2, "项目创建成功");
  });

  it("已展示过引导且关闭回退成功提示时不应再次弹出 toast", () => {
    notifyProjectRuntimeAgentsGuide(
      {
        id: "project-1",
        rootPath: "/tmp/workspace/project-a",
      },
      {
        successMessage: "工作区目录已重新关联",
        showSuccessWhenGuideAlreadySeen: false,
      },
    );
    mockToastSuccess.mockClear();

    notifyProjectRuntimeAgentsGuide(
      {
        id: "project-1",
        rootPath: "/tmp/workspace/project-a",
      },
      {
        successMessage: "工作区目录已重新关联",
        showSuccessWhenGuideAlreadySeen: false,
      },
    );

    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
