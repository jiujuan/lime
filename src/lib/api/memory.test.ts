import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  buildOutlineTree,
  createCharacter,
  createOutlineNode,
  deleteCharacter,
  deleteOutlineNode,
  getCharacter,
  getOutlineNode,
  getProjectMemory,
  getWorldBuilding,
  listCharacters,
  listOutlineNodes,
  updateCharacter,
  updateOutlineNode,
  updateWorldBuilding,
  type Character,
  type OutlineNode,
  type ProjectMemory,
  type ProjectMemoryAppServerClient,
  type WorldBuilding,
} from "./memory";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

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

describe("memory API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("角色 CRUD 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([createCharacterFixture()]);

    await expect(listCharacters("project-1")).rejects.toThrow(
      "character_list is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(getCharacter("c1")).rejects.toThrow(
      "character_get is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(
      createCharacter({ project_id: "project-1", name: "角色2" }),
    ).rejects.toThrow(
      "character_create is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(
      updateCharacter("c2", { name: "角色2-更新" }),
    ).rejects.toThrow(
      "character_update is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(deleteCharacter("c2")).rejects.toThrow(
      "character_delete is retired until Memory CRUD moves to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("世界观 CRUD 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(createWorldBuildingFixture());

    await expect(getWorldBuilding("project-1")).rejects.toThrow(
      "world_building_get is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(
      updateWorldBuilding("project-1", { description: "更新后的世界观" }),
    ).rejects.toThrow(
      "world_building_update is retired until Memory CRUD moves to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("大纲 CRUD 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([createOutlineNodeFixture()]);

    await expect(listOutlineNodes("project-1")).rejects.toThrow(
      "outline_node_list is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(getOutlineNode("n1")).rejects.toThrow(
      "outline_node_get is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(
      createOutlineNode({ project_id: "project-1", title: "第二章" }),
    ).rejects.toThrow(
      "outline_node_create is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(
      updateOutlineNode("n2", { title: "第二章-修订" }),
    ).rejects.toThrow(
      "outline_node_update is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(deleteOutlineNode("n2")).rejects.toThrow(
      "outline_node_delete is retired until Memory CRUD moves to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("项目记忆读取应走 App Server current，不回退 legacy native", async () => {
    const projectMemory = createProjectMemoryFixture();
    const appServerClient = createProjectMemoryClient(projectMemory);

    await expect(
      getProjectMemory("project-1", { appServerClient }),
    ).resolves.toEqual(projectMemory);

    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-1",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("角色、世界观与大纲 CRUD 应在 diagnostic facade 前 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(listCharacters("project-1")).rejects.toThrow(
      "character_list is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(getWorldBuilding("project-1")).rejects.toThrow(
      "world_building_get is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(
      createOutlineNode({ project_id: "project-1", title: "第二章" }),
    ).rejects.toThrow(
      "outline_node_create is retired until Memory CRUD moves to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("角色、世界观与大纲 CRUD 不接受旧 native 错误形态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([{ id: "c1", name: "角色1" }])
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(
        createOutlineNodeFixture({ expanded: undefined as never }),
      )
      .mockResolvedValueOnce({ ok: true });

    await expect(listCharacters("project-1")).rejects.toThrow(
      "character_list is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(getWorldBuilding("project-1")).rejects.toThrow(
      "world_building_get is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(getOutlineNode("n1")).rejects.toThrow(
      "outline_node_get is retired until Memory CRUD moves to App Server current methods",
    );
    await expect(deleteOutlineNode("n1")).rejects.toThrow(
      "outline_node_delete is retired until Memory CRUD moves to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("并发读取同一项目记忆时应复用同一个 projectMemory/read", async () => {
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

  it("短时间重复读取同一项目记忆时应命中本地缓存", async () => {
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
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "project_memory_get",
      expect.anything(),
    );
  });

  it("项目记忆读取缺少 projectId 时应 fail closed", async () => {
    const appServerClient = createProjectMemoryClient(createProjectMemoryFixture());

    await expect(getProjectMemory("   ", { appServerClient })).rejects.toThrow(
      "projectId is required to read App Server project memory",
    );

    expect(appServerClient.request).not.toHaveBeenCalled();
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "project_memory_get",
      expect.anything(),
    );
  });

  it("App Server 未返回 memory 时不应回退 legacy project_memory_get", async () => {
    const appServerClient = createProjectMemoryClient(null);

    await expect(
      getProjectMemory("project-memory-empty", { appServerClient }),
    ).rejects.toThrow("App Server projectMemory/read did not return memory");

    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-memory-empty",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "project_memory_get",
      expect.anything(),
    );
  });

  it("App Server 返回半截项目记忆时不应缓存或回退 legacy project_memory_get", async () => {
    const appServerClient = createProjectMemoryClient({
      characters: [{ id: "c1", name: "半截角色" } as never],
      outline: [],
    });

    await expect(
      getProjectMemory("project-memory-invalid", { appServerClient }),
    ).rejects.toThrow("App Server projectMemory/read did not return valid memory");

    expect(appServerClient.request).toHaveBeenCalledWith("projectMemory/read", {
      projectId: "project-memory-invalid",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "project_memory_get",
      expect.anything(),
    );
  });

  it("应按父子关系和顺序构建大纲树", () => {
    const tree = buildOutlineTree([
      {
        id: "child-2",
        project_id: "p1",
        parent_id: "root-1",
        title: "子节点 2",
        order: 2,
        expanded: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "root-1",
        project_id: "p1",
        title: "根节点 1",
        order: 2,
        expanded: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "child-1",
        project_id: "p1",
        parent_id: "root-1",
        title: "子节点 1",
        order: 1,
        expanded: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "root-0",
        project_id: "p1",
        title: "根节点 0",
        order: 1,
        expanded: true,
        created_at: "",
        updated_at: "",
      },
    ]);

    expect(tree.map((node) => node.id)).toEqual(["root-0", "root-1"]);
    expect(tree[1].children.map((node) => node.id)).toEqual([
      "child-1",
      "child-2",
    ]);
  });
});
