import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  compileKnowledgePack,
  getKnowledgePack,
  importKnowledgeSource,
  listKnowledgePacks,
  resolveKnowledgeContext,
  setDefaultKnowledgePack,
  updateKnowledgePackStatus,
  validateKnowledgeContextRun,
} from "./knowledge";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("knowledge API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
    vi.mocked(safeInvoke).mockReset();
  });

  it("知识包列表应通过 App Server knowledgePack/list 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        workingDir: "/tmp/workspace",
        rootPath: "/tmp/workspace/.lime/knowledge",
        packs: [],
      },
    });

    await expect(
      listKnowledgePacks({ workingDir: "/tmp/workspace" }),
    ).resolves.toEqual({
      workingDir: "/tmp/workspace",
      rootPath: "/tmp/workspace/.lime/knowledge",
      packs: [],
    });

    expect(appServerRequestMock).toHaveBeenCalledWith("knowledgePack/list", {
      workingDir: "/tmp/workspace",
      includeArchived: false,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("知识包列表应透传 includeArchived 到 App Server", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        workingDir: "/tmp/workspace",
        rootPath: "/tmp/workspace/.lime/knowledge",
        packs: [],
      },
    });

    await listKnowledgePacks({
      workingDir: " /tmp/workspace ",
      includeArchived: true,
    });

    expect(appServerRequestMock).toHaveBeenCalledWith("knowledgePack/list", {
      workingDir: "/tmp/workspace",
      includeArchived: true,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("知识包列表缺少 workingDir 时应 fail closed", async () => {
    await expect(listKnowledgePacks({ workingDir: "   " })).rejects.toThrow(
      "workingDir is required to list App Server knowledge packs",
    );

    expect(appServerRequestMock).not.toHaveBeenCalled();
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("App Server 知识包列表缺少 packs 时不应回退 legacy knowledge_list_packs", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        workingDir: "/tmp/workspace",
        rootPath: "/tmp/workspace/.lime/knowledge",
      },
    });

    await expect(
      listKnowledgePacks({ workingDir: "/tmp/workspace" }),
    ).rejects.toThrow("App Server knowledgePack/list did not return packs");

    expect(appServerRequestMock).toHaveBeenCalledWith("knowledgePack/list", {
      workingDir: "/tmp/workspace",
      includeArchived: false,
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("knowledge_list_packs", {
      request: {
        workingDir: "/tmp/workspace",
      },
    });
  });

  it("应通过统一网关代理知识包命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ metadata: { name: "sample-product" } })
      .mockResolvedValueOnce({ source: { relativePath: "sources/brief.md" } })
      .mockResolvedValueOnce({ selectedSourceCount: 1 })
      .mockResolvedValueOnce({ defaultPackName: "sample-product" })
      .mockResolvedValueOnce({
        pack: { metadata: { name: "sample-product", status: "ready" } },
        previousStatus: "needs-review",
        clearedDefault: false,
      })
      .mockResolvedValueOnce({
        packName: "sample-product",
        fencedContext:
          '<knowledge_pack name="sample-product"></knowledge_pack>',
        selectedViews: [],
        selectedFiles: [],
        sourceAnchors: [],
        warnings: [],
        missing: [],
        tokenEstimate: 1,
      })
      .mockResolvedValueOnce({
        valid: true,
        runId: "context-20260506T091000Z",
        status: "passed",
        errors: [],
        warnings: [],
      });

    await expect(
      getKnowledgePack("/tmp/workspace", "sample-product"),
    ).resolves.toEqual(
      expect.objectContaining({ metadata: { name: "sample-product" } }),
    );
    await expect(
      importKnowledgeSource({
        workingDir: "/tmp/workspace",
        packName: "sample-product",
        sourceText: "示例产品事实",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ relativePath: "sources/brief.md" }),
      }),
    );
    await expect(
      compileKnowledgePack("/tmp/workspace", "sample-product"),
    ).resolves.toEqual(expect.objectContaining({ selectedSourceCount: 1 }));
    await expect(
      setDefaultKnowledgePack("/tmp/workspace", "sample-product"),
    ).resolves.toEqual(
      expect.objectContaining({ defaultPackName: "sample-product" }),
    );
    await expect(
      updateKnowledgePackStatus({
        workingDir: "/tmp/workspace",
        name: "sample-product",
        status: "ready",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        previousStatus: "needs-review",
        clearedDefault: false,
      }),
    );
    await expect(
      resolveKnowledgeContext({
        workingDir: "/tmp/workspace",
        name: "sample-product",
        task: "写产品介绍",
        writeRun: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        fencedContext: expect.stringContaining("<knowledge_pack"),
      }),
    );
    await expect(
      validateKnowledgeContextRun({
        workingDir: "/tmp/workspace",
        name: "sample-product",
        runPath: "runs/context-20260506T091000Z.json",
      }),
    ).resolves.toEqual(expect.objectContaining({ valid: true }));

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "knowledge_get_pack", {
      request: {
        workingDir: "/tmp/workspace",
        name: "sample-product",
      },
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "knowledge_import_source", {
      request: {
        workingDir: "/tmp/workspace",
        packName: "sample-product",
        sourceText: "示例产品事实",
      },
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "knowledge_compile_pack", {
      request: {
        workingDir: "/tmp/workspace",
        name: "sample-product",
      },
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      4,
      "knowledge_set_default_pack",
      {
        request: {
          workingDir: "/tmp/workspace",
          name: "sample-product",
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      5,
      "knowledge_update_pack_status",
      {
        request: {
          workingDir: "/tmp/workspace",
          name: "sample-product",
          status: "ready",
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(6, "knowledge_resolve_context", {
      request: {
        workingDir: "/tmp/workspace",
        name: "sample-product",
        task: "写产品介绍",
        writeRun: true,
      },
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      7,
      "knowledge_validate_context_run",
      {
        request: {
          workingDir: "/tmp/workspace",
          name: "sample-product",
          runPath: "runs/context-20260506T091000Z.json",
        },
      },
    );
    expect(safeInvoke).not.toHaveBeenCalledWith("knowledge_list_packs", {
      request: {
        workingDir: "/tmp/workspace",
      },
    });
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });
});
