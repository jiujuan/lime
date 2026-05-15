import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expertAnalyticsStorageKeys,
  flushExpertCatalogEvents,
  recordExpertCatalogEvent,
} from "./expertAnalytics";

describe("expertAnalytics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.__LIME_OEM_CLOUD__ = {
      enabled: true,
      baseUrl: "https://lime.example.com",
      tenantId: "tenant-0001",
      sessionToken: "session-token",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__LIME_OEM_CLOUD__;
    window.localStorage.clear();
  });

  it("上报专家事件时只发送运营字段，不发送敏感 metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 201,
        data: { acceptedCount: 1, rejectedCount: 0 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await recordExpertCatalogEvent({
      expertId: "marketing-strategist",
      releaseId: "expert-release-0001",
      eventName: "expert_chat_started",
      sourceSurface: "expert_plaza",
      catalogVersion: "tenant-0001:test",
      metadata: {
        category: "marketing",
        prompt: "用户原始输入不应发送",
        assistantResponse: "助手回复不应发送",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lime.example.com/api/v1/public/tenants/tenant-0001/client/experts/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as globalThis.RequestInit;
    const body = JSON.parse(String(request.body)) as {
      events: Array<{ metadata?: Record<string, string> }>;
    };
    expect(body.events[0]?.metadata).toEqual({ category: "marketing" });
    expect(String(request.body)).not.toContain("用户原始输入");
    expect(String(request.body)).not.toContain("助手回复");
  });

  it("网络失败时进入本地队列，flush 成功后清空", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 201,
          data: { acceptedCount: 1, rejectedCount: 0 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await recordExpertCatalogEvent({
      expertId: "marketing-strategist",
      releaseId: "expert-release-0001",
      eventName: "expert_detail_opened",
      sourceSurface: "expert_plaza",
    });

    expect(
      window.localStorage.getItem(expertAnalyticsStorageKeys.queue),
    ).toContain("marketing-strategist");

    await flushExpertCatalogEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem(expertAnalyticsStorageKeys.queue)).toBe(
      null,
    );
  });
});
