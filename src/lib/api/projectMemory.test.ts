import { describe, expect, it, vi } from "vitest";
import {
  getProjectMemory,
  type Character,
  type OutlineNode,
  type ProjectMemory,
  type ProjectMemoryAppServerClient,
  type WorldBuilding,
} from "./projectMemory";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createProjectMemoryClient(
  memory: ProjectMemory | null,
): ProjectMemoryAppServerClient {
  return {
    request: vi.fn().mockResolvedValue({ result: { memory } }),
  };
}

function createCharacterFixture(
  overrides: Partial<Character> = {},
): Character {
  return {
    id: "c1",
    project_id: "project-1",
    name: "角色1",
    aliases: [],
    description: "角色描述",
    relationships: [],
    is_main: false,
    order: 1,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function createWorldBuildingFixture(
  overrides: Partial<WorldBuilding> = {},
): WorldBuilding {
  return {
    project_id: "project-1",
    description: "世界观",
    updated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function createOutlineNodeFixture(
  overrides: Partial<OutlineNode> = {},
): OutlineNode {
  return {
    id: "n1",
    project_id: "project-1",
    title: "第一章",
    order: 1,
    expanded: true,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
    ...overrides,
  };
}

function createProjectMemoryFixture(
  overrides: Partial<ProjectMemory> = {},
): ProjectMemory {
  return {
    characters: [createCharacterFixture()],
    world_building: createWorldBuildingFixture(),
    outline: [createOutlineNodeFixture()],
    ...overrides,
  };
}

describe("projectMemory API", () => {
  it("项目上下文读取应走 App Server current method", async () => {
    const projectMemory = createProjectMemoryFixture();
    const appServerClient = createProjectMemoryClient(projectMemory);

    await expect(
      getProjectMemory("project-1", { appServerClient }),
    ).resolves.toEqual(projectMemory);

    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-1",
    });
  });

  it("并发读取同一项目上下文时应复用同一个 projectMemory/read", async () => {
    const deferred = createDeferred<{
      result: {
        memory: ProjectMemory;
      };
    }>();
    const appServerClient: ProjectMemoryAppServerClient = {
      request: vi.fn().mockReturnValueOnce(deferred.promise),
    };

    const first = getProjectMemory("project-memory-dedupe", {
      appServerClient,
    });
    const second = getProjectMemory("project-memory-dedupe", {
      appServerClient,
    });

    expect(appServerClient.request).toHaveBeenCalledTimes(1);
    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-memory-dedupe",
    });

    deferred.resolve({
      result: {
        memory: createProjectMemoryFixture({ world_building: undefined }),
      },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      createProjectMemoryFixture({ world_building: undefined }),
      createProjectMemoryFixture({ world_building: undefined }),
    ]);
  });

  it("短时间重复读取同一项目上下文时应命中本地缓存", async () => {
    const projectMemory = createProjectMemoryFixture({
      world_building: undefined,
    });
    const appServerClient = createProjectMemoryClient(projectMemory);

    await expect(
      getProjectMemory("project-memory-cache", { appServerClient }),
    ).resolves.toEqual(projectMemory);
    await expect(
      getProjectMemory("project-memory-cache", { appServerClient }),
    ).resolves.toEqual(projectMemory);

    expect(appServerClient.request).toHaveBeenCalledTimes(1);
  });

  it("项目上下文读取缺少 projectId 时应 fail closed", async () => {
    const appServerClient = createProjectMemoryClient(
      createProjectMemoryFixture(),
    );

    await expect(getProjectMemory("   ", { appServerClient })).rejects.toThrow(
      "projectId is required to read App Server project memory",
    );

    expect(appServerClient.request).not.toHaveBeenCalled();
  });

  it("App Server 未返回项目上下文时不应返回空对象", async () => {
    const appServerClient = createProjectMemoryClient(null);

    await expect(
      getProjectMemory("project-memory-empty", { appServerClient }),
    ).rejects.toThrow(
      "App Server projectMemory/read did not return project memory",
    );

    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-memory-empty",
    });
  });

  it("App Server 返回半截项目上下文时应 fail closed", async () => {
    const appServerClient = createProjectMemoryClient({
      characters: [{ id: "c1", name: "半截角色" } as never],
      outline: [],
    });

    await expect(
      getProjectMemory("project-memory-invalid", { appServerClient }),
    ).rejects.toThrow(
      "App Server projectMemory/read did not return valid project memory",
    );

    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-memory-invalid",
    });
  });
});
