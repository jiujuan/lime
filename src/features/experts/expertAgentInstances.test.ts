import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExpertAgentInstanceKey,
  expertAgentInstanceStorageKeys,
  findExpertAgentInstance,
  refreshExpertAgentInstancesFromCloud,
  readExpertAgentInstances,
  syncExpertAgentInstanceToCloud,
  updateExpertAgentInstanceSkillRefs,
  upsertExpertAgentInstance,
} from "./expertAgentInstances";

describe("expertAgentInstances", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
    vi.unstubAllGlobals();
  });

  it("应以 tenant/project/expert/release 生成配置 key 并复用记录", () => {
    const identity = {
      tenantId: "tenant-0001",
      projectId: "project-a",
      expertId: "marketing-strategist",
      releaseId: "rel-1",
    };

    const first = upsertExpertAgentInstance({
      ...identity,
      skillRefsOverride: ["skill:csv"],
      now: 100,
    });
    const second = upsertExpertAgentInstance({
      ...identity,
      skillRefsOverride: ["skill:xlsx"],
      now: 200,
    });

    expect(first.agentInstanceKey).toBe(
      buildExpertAgentInstanceKey(identity),
    );
    expect(second.agentInstanceId).toBe(first.agentInstanceId);
    expect(findExpertAgentInstance(identity)?.skillRefsOverride).toEqual([
      "skill:xlsx",
    ]);
    expect(readExpertAgentInstances()).toHaveLength(1);
  });

  it("不同项目下不应复用同一专家配置", () => {
    const baseIdentity = {
      tenantId: "tenant-0001",
      expertId: "marketing-strategist",
      releaseId: "rel-1",
    };

    upsertExpertAgentInstance({
      ...baseIdentity,
      projectId: "project-a",
      skillRefsOverride: ["skill:csv"],
      now: 100,
    });
    upsertExpertAgentInstance({
      ...baseIdentity,
      projectId: "project-b",
      skillRefsOverride: ["skill:xlsx"],
      now: 200,
    });

    expect(
      findExpertAgentInstance({ ...baseIdentity, projectId: "project-a" })
        ?.skillRefsOverride,
    ).toEqual(["skill:csv"]);
    expect(
      findExpertAgentInstance({ ...baseIdentity, projectId: "project-b" })
        ?.skillRefsOverride,
    ).toEqual(["skill:xlsx"]);
    expect(findExpertAgentInstance(baseIdentity)).toBeNull();
  });

  it("应持久化项目作用域下的技能覆盖", () => {
    const record = updateExpertAgentInstanceSkillRefs({
      tenantId: "tenant-0001",
      projectId: "project-a",
      expertId: "data-analyst",
      releaseId: "rel-data",
      skillRefsOverride: ["skill:csv", "skill:csv"],
    });

    expect(record?.skillRefsOverride).toEqual(["skill:csv"]);

    updateExpertAgentInstanceSkillRefs({
      tenantId: "tenant-0001",
      projectId: "project-a",
      expertId: "data-analyst",
      releaseId: "rel-data",
      skillRefsOverride: ["skill:xlsx"],
    });

    expect(
      JSON.parse(
        window.localStorage.getItem(expertAgentInstanceStorageKeys.instances) ||
          "[]",
      )[0],
    ).toMatchObject({
      projectId: "project-a",
      skillRefsOverride: ["skill:xlsx"],
    });
  });

  it("读取旧专家实例缓存时应丢弃 latestSessionId", () => {
    window.localStorage.setItem(
      expertAgentInstanceStorageKeys.instances,
      JSON.stringify([
        {
          tenantId: "tenant-0001",
          projectId: "project-a",
          expertId: "data-analyst",
          releaseId: "rel-data",
          latestSessionId: "session-data",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
          lastStartedAt: 1,
        },
      ]),
    );

    expect(readExpertAgentInstances()[0]).not.toHaveProperty(
      "latestSessionId",
    );
  });

  it("有云端会话时应同步到 LimeCore 专家 Agent 实例接口", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://lime.example.com",
      tenantId: "tenant-0001",
    };
    window.__LIME_SESSION_TOKEN__ = "session-token";
    const fetchMock = vi.fn(async (_input: unknown, _init?: { body?: unknown }) => ({
      ok: true,
      json: async () => ({ code: 200, data: {} }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await syncExpertAgentInstanceToCloud({
      tenantId: "tenant-0001",
      projectId: "project-a",
      expertId: "marketing-strategist",
      releaseId: "rel-1",
      agentInstanceId:
        "expert:tenant-0001:project-a:marketing-strategist:rel-1",
      agentInstanceKey:
        "tenant-0001:project-a:marketing-strategist:rel-1",
      catalogVersion: "tenant-0001:v1",
      skillRefsOverride: ["skill:docx"],
      status: "active",
      createdAt: 1,
      updatedAt: 2,
      lastStartedAt: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lime.example.com/api/v1/public/tenants/tenant-0001/client/expert-agent-instances",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      projectId: "project-a",
      expertId: "marketing-strategist",
      releaseId: "rel-1",
      catalogVersion: "tenant-0001:v1",
      skillRefsOverride: ["skill:docx"],
    });
  });

  it("有云端会话时应从 LimeCore 拉取并合并专家 Agent 实例", async () => {
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://lime.example.com",
      tenantId: "tenant-0001",
    };
    window.__LIME_SESSION_TOKEN__ = "session-token";
    upsertExpertAgentInstance({
      tenantId: "tenant-0001",
      projectId: "project-local",
      expertId: "local-only",
      releaseId: "rel-local",
      skillRefsOverride: ["skill:local"],
      now: 100,
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 200,
        data: {
          items: [
            {
              id: "expert-agent-0001",
              tenantId: "tenant-0001",
              projectId: "project-cloud",
              expertId: "marketing-strategist",
              releaseId: "rel-1",
              catalogVersion: "tenant-0001:v1",
              latestSessionId: "session-cloud",
              skillRefsOverride: ["skill:docx"],
              status: "active",
              createdAt: "2026-05-15T10:00:00.000Z",
              updatedAt: "2026-05-15T10:01:00.000Z",
              lastStartedAt: "2026-05-15T10:01:00.000Z",
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const records = await refreshExpertAgentInstancesFromCloud();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lime.example.com/api/v1/public/tenants/tenant-0001/client/expert-agent-instances?status=active",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
    expect(
      records.find((item) => item.expertId === "marketing-strategist"),
    ).toMatchObject({
      agentInstanceId: "expert-agent-0001",
      projectId: "project-cloud",
      skillRefsOverride: ["skill:docx"],
    });
    expect(records.find((item) => item.expertId === "local-only")).toMatchObject(
      {
        projectId: "project-local",
        skillRefsOverride: ["skill:local"],
      },
    );
  });
});
