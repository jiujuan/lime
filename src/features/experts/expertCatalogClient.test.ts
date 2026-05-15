import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getExpertCatalog,
  readCachedExpertCatalog,
  saveCachedExpertCatalog,
} from "./expertCatalogClient";
import { getSeededExpertCatalog } from "./seededExpertCatalog";
import type { ExpertCatalog } from "./types";

function buildRemoteCatalog(): ExpertCatalog {
  const catalog = getSeededExpertCatalog();
  return {
    ...catalog,
    version: "remote-experts-2026-05-15",
    tenantId: "tenant-demo",
    items: catalog.items.map((item) => ({
      ...item,
      source: "cloud_catalog",
    })),
  };
}

describe("expertCatalogClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete window.__LIME_BOOTSTRAP__;
    delete window.__LIME_OEM_CLOUD__;
    delete window.__LIME_SESSION_TOKEN__;
    vi.unstubAllGlobals();
  });

  it("无远端刷新请求时应优先读取本地缓存", async () => {
    saveCachedExpertCatalog(buildRemoteCatalog());

    const catalog = await getExpertCatalog();

    expect(catalog.tenantId).toBe("tenant-demo");
    expect(catalog.version).toBe("remote-experts-2026-05-15");
  });

  it("存在 OEM 会话时应从 LimeCore 刷新并缓存专家目录", async () => {
    window.__LIME_OEM_CLOUD__ = {
      baseUrl: "https://oem.example.com",
      tenantId: "tenant-demo",
    };
    window.__LIME_SESSION_TOKEN__ = "session-token-demo";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 200,
        message: "success",
        data: buildRemoteCatalog(),
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getExpertCatalog({ refreshRemote: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oem.example.com/api/v1/public/tenants/tenant-demo/client/experts?includeRankings=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer session-token-demo",
        }),
      }),
    );
    expect(catalog.tenantId).toBe("tenant-demo");
    expect(readCachedExpertCatalog()?.version).toBe(
      "remote-experts-2026-05-15",
    );
  });

  it("远端刷新失败时应回退到上次缓存而不是直接丢回 seeded", async () => {
    saveCachedExpertCatalog(buildRemoteCatalog());
    window.__LIME_OEM_CLOUD__ = {
      baseUrl: "https://oem.example.com",
      tenantId: "tenant-demo",
    };
    window.__LIME_SESSION_TOKEN__ = "session-token-demo";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ message: "unavailable" }),
      })),
    );

    const catalog = await getExpertCatalog({ refreshRemote: true });

    expect(catalog.tenantId).toBe("tenant-demo");
    expect(catalog.version).toBe("remote-experts-2026-05-15");
  });
});
