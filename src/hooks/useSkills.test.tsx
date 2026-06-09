import { useEffect } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppType, Skill, SkillRepo } from "@/lib/api/skills";
import {
  cleanupMountedRoots,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import { useSkills } from "./useSkills";

const {
  mockGetLocal,
  mockGetAll,
  mockGetRepos,
  mockRefreshCache,
  mockInstall,
  mockUninstall,
} = vi.hoisted(() => ({
  mockGetLocal: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetRepos: vi.fn(),
  mockRefreshCache: vi.fn(),
  mockInstall: vi.fn(),
  mockUninstall: vi.fn(),
}));

vi.mock("@/lib/api/skills", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/skills")>(
      "@/lib/api/skills",
    );

  return {
    ...actual,
    skillsApi: {
      ...actual.skillsApi,
      getLocal: (...args: unknown[]) => mockGetLocal(...args),
      getAll: (...args: unknown[]) => mockGetAll(...args),
      getRepos: (...args: unknown[]) => mockGetRepos(...args),
      refreshCache: (...args: unknown[]) => mockRefreshCache(...args),
      install: (...args: unknown[]) => mockInstall(...args),
      uninstall: (...args: unknown[]) => mockUninstall(...args),
    },
  };
});

type HookValue = ReturnType<typeof useSkills>;

interface HarnessProps {
  app?: AppType;
  includeRepos?: boolean;
  onReady: (value: HookValue) => void;
}

function HookHarness({ app = "lime", includeRepos, onReady }: HarnessProps) {
  const value = useSkills(app, { includeRepos });

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    key: "local:test-skill",
    name: "测试技能",
    description: "测试用技能",
    directory: "test-skill",
    installed: true,
    sourceKind: "other",
    ...overrides,
  };
}

const mountedRoots: MountedRoot[] = [];

describe("useSkills", () => {
  let latestValue: HookValue | null = null;

  beforeEach(() => {
    setupReactActEnvironment();
    latestValue = null;
    vi.clearAllMocks();
    mockGetLocal.mockResolvedValue([]);
    mockGetAll.mockResolvedValue([]);
    mockGetRepos.mockResolvedValue([] satisfies SkillRepo[]);
    mockRefreshCache.mockResolvedValue(true);
    mockInstall.mockResolvedValue(true);
    mockUninstall.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  async function renderHook(app: AppType, includeRepos?: boolean) {
    mountHarness(
      HookHarness,
      {
        app,
        includeRepos,
        onReady: (value) => {
          latestValue = value;
        },
      },
      mountedRoots,
    );
    await flushEffects(6);
  }

  function getLatestValue(): HookValue {
    expect(latestValue).not.toBeNull();
    return latestValue as HookValue;
  }

  it("首次挂载时只加载本地技能和仓库信息", async () => {
    const localSkill = createSkill();
    mockGetLocal.mockResolvedValue([localSkill]);

    await renderHook("lime");

    expect(mockGetLocal).toHaveBeenCalledWith("lime");
    expect(mockGetRepos).toHaveBeenCalledTimes(1);
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(getLatestValue().skills).toEqual([localSkill]);
    expect(getLatestValue().remoteLoading).toBe(false);
  });

  it("显式刷新时才清缓存并拉取远程技能目录", async () => {
    const remoteSkill = createSkill({
      key: "owner/repo:test-skill",
      installed: false,
      catalogSource: "remote",
      repoOwner: "owner",
      repoName: "repo",
      repoBranch: "main",
    });
    mockGetAll.mockResolvedValue([remoteSkill]);

    await renderHook("codex");

    await act(async () => {
      await getLatestValue().refresh();
    });
    await flushEffects(4);

    expect(mockRefreshCache).toHaveBeenCalledTimes(1);
    expect(mockGetAll).toHaveBeenCalledWith("codex", { refreshRemote: true });
    expect(getLatestValue().skills).toEqual([remoteSkill]);
  });

  it("关闭 repo 拉取时不应触发仓库请求", async () => {
    await renderHook("gemini", false);

    expect(mockGetLocal).toHaveBeenCalledWith("gemini");
    expect(mockGetRepos).not.toHaveBeenCalled();
  });

  it("关闭 repo 拉取时刷新仍只更新本地技能", async () => {
    const initialSkill = createSkill({ directory: "initial-skill" });
    const refreshedSkill = createSkill({ directory: "refreshed-skill" });
    mockGetLocal
      .mockResolvedValueOnce([initialSkill])
      .mockResolvedValueOnce([refreshedSkill]);

    await renderHook("claude", false);

    await act(async () => {
      await getLatestValue().refresh();
    });
    await flushEffects(4);

    expect(mockRefreshCache).not.toHaveBeenCalled();
    expect(mockGetLocal).toHaveBeenCalledTimes(2);
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(getLatestValue().skills).toEqual([refreshedSkill]);
  });

  it("关闭 repo 拉取时卸载后重新读取本地技能", async () => {
    const localSkill = createSkill({ directory: "local-skill" });
    mockGetLocal.mockResolvedValueOnce([localSkill]).mockResolvedValueOnce([]);

    await renderHook("codex", false);

    await act(async () => {
      await getLatestValue().uninstall("local-skill");
    });
    await flushEffects(4);

    expect(mockUninstall).toHaveBeenCalledWith("local-skill", "codex");
    expect(mockGetLocal).toHaveBeenCalledTimes(2);
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(getLatestValue().skills).toEqual([]);
  });
});
