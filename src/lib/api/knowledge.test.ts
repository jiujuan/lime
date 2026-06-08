import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("knowledge API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
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
  });

  it("知识包列表缺少 workingDir 时应 fail closed", async () => {
    await expect(listKnowledgePacks({ workingDir: "   " })).rejects.toThrow(
      "workingDir is required to list App Server knowledge packs",
    );

    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("App Server 知识包列表缺少 packs 时应 fail closed", async () => {
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
  });

  it("应通过 App Server current 网关代理全部知识包命令", async () => {
    const packDetail = {
      metadata: { name: "sample-product" },
      rootPath: "/tmp/workspace/.lime/knowledge/sample-product",
      knowledgePath: "/tmp/workspace/.lime/knowledge/sample-product",
      defaultForWorkspace: false,
      updatedAt: 0,
      sourceCount: 1,
      wikiCount: 0,
      compiledCount: 1,
      runCount: 1,
      guide: "",
      sources: [],
      wiki: [],
      compiled: [],
      runs: [],
    };
    const sourceFile = {
      relativePath: "sources/brief.md",
      absolutePath: "/tmp/workspace/.lime/knowledge/sample-product/sources/brief.md",
      bytes: 10,
      updatedAt: 0,
    };
    const compiledView = {
      relativePath: "compiled/index.md",
      absolutePath: "/tmp/workspace/.lime/knowledge/sample-product/compiled/index.md",
      bytes: 20,
      updatedAt: 0,
    };
    const compileRun = {
      relativePath: "runs/compile.json",
      absolutePath: "/tmp/workspace/.lime/knowledge/sample-product/runs/compile.json",
      bytes: 30,
      updatedAt: 0,
    };

    appServerRequestMock
      .mockResolvedValueOnce({
        result: {
          pack: packDetail,
        },
      })
      .mockResolvedValueOnce({
        result: { pack: packDetail, source: sourceFile },
      })
      .mockResolvedValueOnce({
        result: {
          pack: packDetail,
          selectedSourceCount: 1,
          compiledView,
          run: compileRun,
          warnings: [],
        },
      })
      .mockResolvedValueOnce({
        result: {
          defaultPackName: "sample-product",
          defaultMarkerPath: "/tmp/workspace/.lime/knowledge/default",
        },
      })
      .mockResolvedValueOnce({
        result: {
          pack: {
            ...packDetail,
            metadata: { name: "sample-product", status: "ready" },
          },
          previousStatus: "needs-review",
          clearedDefault: false,
        },
      })
      .mockResolvedValueOnce({
        result: {
          packName: "sample-product",
          status: "ready",
          fencedContext:
            '<knowledge_pack name="sample-product"></knowledge_pack>',
          selectedViews: [],
          selectedFiles: [],
          sourceAnchors: [],
          warnings: [],
          missing: [],
          tokenEstimate: 1,
        },
      })
      .mockResolvedValueOnce({
        result: {
          valid: true,
          runId: "context-20260506T091000Z",
          status: "passed",
          errors: [],
          warnings: [],
        },
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
      expect.objectContaining({
        defaultPackName: "sample-product",
        defaultMarkerPath: "/tmp/workspace/.lime/knowledge/default",
      }),
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

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "knowledgePack/read",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "knowledgePack/source/import",
      {
        workingDir: "/tmp/workspace",
        packName: "sample-product",
        sourceText: "示例产品事实",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      3,
      "knowledgePack/compile",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      4,
      "knowledgePack/default/set",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      5,
      "knowledgePack/status/update",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
        status: "ready",
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      6,
      "knowledgeContext/resolve",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
        task: "写产品介绍",
        writeRun: true,
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      7,
      "knowledgeContextRun/validate",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
        runPath: "runs/context-20260506T091000Z.json",
      },
    );
    expect(
      appServerRequestMock.mock.calls.some(([method]) =>
        String(method).startsWith("knowledge_"),
      ),
    ).toBe(false);
  });

  it("Knowledge 编译应向 App Server 透传 builderRuntime 请求", async () => {
    const packDetail = {
      metadata: { name: "sample-product" },
      rootPath: "/tmp/workspace/.lime/knowledge/sample-product",
      knowledgePath: "/tmp/workspace/.lime/knowledge/sample-product",
      defaultForWorkspace: false,
      updatedAt: 0,
      sourceCount: 1,
      wikiCount: 0,
      compiledCount: 1,
      runCount: 1,
      guide: "",
      sources: [],
      wiki: [],
      compiled: [],
      runs: [],
    };
    const compiledView = {
      relativePath: "compiled/index.md",
      absolutePath: "/tmp/workspace/.lime/knowledge/sample-product/compiled/index.md",
      bytes: 20,
      updatedAt: 0,
    };
    const compileRun = {
      relativePath: "runs/compile.json",
      absolutePath: "/tmp/workspace/.lime/knowledge/sample-product/runs/compile.json",
      bytes: 30,
      updatedAt: 0,
    };
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        pack: packDetail,
        selectedSourceCount: 1,
        compiledView,
        run: compileRun,
        warnings: [],
      },
    });

    await compileKnowledgePack(" /tmp/workspace ", " sample-product ", {
      enabled: true,
      providerOverride: "local-provider",
      modelOverride: "local-model",
      sessionId: "session-1",
    });

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "knowledgePack/compile",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
        builderRuntime: {
          enabled: true,
          providerOverride: "local-provider",
          modelOverride: "local-model",
          sessionId: "session-1",
        },
      },
    );
  });

  it("Knowledge 编译缺少 workingDir 时应 fail closed", async () => {
    await expect(
      compileKnowledgePack("   ", "sample-product"),
    ).rejects.toThrow(
      "workingDir is required to compile App Server knowledge pack",
    );
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("Knowledge 导入缺少 packName 时应 fail closed", async () => {
    await expect(
      importKnowledgeSource({
        workingDir: "/tmp/workspace",
        packName: "  ",
        sourceText: "示例产品事实",
      }),
    ).rejects.toThrow(
      "packName is required to import App Server knowledge source",
    );
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("App Server Knowledge 详情缺少 pack 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        success: true,
      },
    });

    await expect(
      getKnowledgePack("/tmp/workspace", "sample-product"),
    ).rejects.toThrow(
      "knowledgePack/read did not return a knowledge pack detail",
    );
  });

  it("App Server Knowledge 导入缺少 source 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        pack: {
          metadata: { name: "sample-product" },
          rootPath: "/tmp/workspace/.lime/knowledge/sample-product",
        },
      },
    });

    await expect(
      importKnowledgeSource({
        workingDir: "/tmp/workspace",
        packName: "sample-product",
        sourceText: "示例产品事实",
      }),
    ).rejects.toThrow(
      "knowledgePack/source/import did not return an imported source file",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "knowledgePack/source/import",
      {
        workingDir: "/tmp/workspace",
        packName: "sample-product",
        sourceText: "示例产品事实",
      },
    );
  });

  it("App Server Knowledge 编译缺少 compile result 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        error: { code: -32603, message: "not implemented" },
      },
    });

    await expect(
      compileKnowledgePack("/tmp/workspace", "sample-product"),
    ).rejects.toThrow("knowledgePack/compile did not return a compile result");
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "knowledgePack/compile",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
      },
    );
  });

  it("App Server Knowledge 上下文校验缺少 validation 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({ result: { success: true } });

    await expect(
      validateKnowledgeContextRun({
        workingDir: "/tmp/workspace",
        name: "sample-product",
        runPath: "runs/context-20260506T091000Z.json",
      }),
    ).rejects.toThrow(
      "knowledgeContextRun/validate did not return a context run validation",
    );
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "knowledgeContextRun/validate",
      {
        workingDir: "/tmp/workspace",
        name: "sample-product",
        runPath: "runs/context-20260506T091000Z.json",
      },
    );
  });
});
