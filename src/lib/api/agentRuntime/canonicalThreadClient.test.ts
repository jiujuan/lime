import { describe, expect, it, vi } from "vitest";

import type {
  AppServerThread,
  AppServerThreadListResponse,
} from "@/lib/api/appServer";
import {
  listCanonicalChildThreads,
  readCanonicalThreadFamily,
  type CanonicalThreadListClient,
} from "./canonicalThreadClient";

function thread(threadId: string, parentThreadId?: string): AppServerThread {
  return {
    archived: false,
    createdAtMs: 100,
    parentThreadId,
    sessionId: `session-${threadId}`,
    status: { type: "idle" },
    threadId,
    turns: [],
    turnsView: "summary",
    updatedAtMs: 200,
  };
}

function response(result: AppServerThreadListResponse) {
  return {
    configWarnings: [],
    id: 1,
    messages: [],
    notifications: [],
    response: { id: 1, result },
    result,
  };
}

describe("listCanonicalChildThreads", () => {
  it("遍历 canonical thread/list 分页并只返回直接 child", async () => {
    const listThreads = vi
      .fn<CanonicalThreadListClient["listThreads"]>()
      .mockResolvedValueOnce(
        response({
          data: [thread("child-b", "parent"), thread("other", "outside")],
          nextCursor: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: [thread("child-a", "parent"), thread("grandchild", "child-a")],
        }),
      );

    const children = await listCanonicalChildThreads({
      client: { listThreads },
      parentThreadId: " parent ",
    });

    expect(children.map((child) => child.threadId)).toEqual([
      "child-b",
      "child-a",
    ]);
    expect(listThreads).toHaveBeenNthCalledWith(1, {
      includeArchived: false,
      limit: 500,
      turnsView: "summary",
    });
    expect(listThreads).toHaveBeenNthCalledWith(2, {
      cursor: "page-2",
      includeArchived: false,
      limit: 500,
      turnsView: "summary",
    });
  });

  it("空 parent identity 不访问 App Server", async () => {
    const listThreads = vi.fn<CanonicalThreadListClient["listThreads"]>();

    await expect(
      listCanonicalChildThreads({
        client: { listThreads },
        parentThreadId: "  ",
      }),
    ).resolves.toEqual([]);
    expect(listThreads).not.toHaveBeenCalled();
  });

  it("重复 cursor 时停止，避免异常 server page 形成循环", async () => {
    const listThreads = vi
      .fn<CanonicalThreadListClient["listThreads"]>()
      .mockResolvedValue(
        response({ data: [thread("child", "parent")], nextCursor: "same" }),
      );

    const children = await listCanonicalChildThreads({
      client: { listThreads },
      parentThreadId: "parent",
    });

    expect(children).toHaveLength(1);
    expect(listThreads).toHaveBeenCalledTimes(2);
  });
});

describe("readCanonicalThreadFamily", () => {
  it("从 canonical thread/list 同时读取 children 与当前 thread 的 parent", async () => {
    const listThreads = vi
      .fn<CanonicalThreadListClient["listThreads"]>()
      .mockResolvedValue(
        response({
          data: [
            thread("parent"),
            thread("child", "parent"),
            thread("grandchild", "child"),
          ],
        }),
      );

    await expect(
      readCanonicalThreadFamily({
        client: { listThreads },
        threadId: "child",
      }),
    ).resolves.toEqual({
      children: [thread("grandchild", "child")],
      parentThreadId: "parent",
    });
  });

  it("空 thread identity 不访问 App Server", async () => {
    const listThreads = vi.fn<CanonicalThreadListClient["listThreads"]>();

    await expect(
      readCanonicalThreadFamily({
        client: { listThreads },
        threadId: "  ",
      }),
    ).resolves.toEqual({ children: [] });
    expect(listThreads).not.toHaveBeenCalled();
  });
});
